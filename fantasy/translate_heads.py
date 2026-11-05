"""Αυτόματη μετάφραση των τίτλων «Από τον Τύπο» στις γλώσσες του site (el, en, es, sr, tr).

Δωρεάν και χωρίς API: μοντέλα Argos Translate (ανοιχτού κώδικα, OpenNMT/CTranslate2 + SentencePiece) που τρέχουν
τοπικά στο GitHub Actions. Αν δεν υπάρχει απευθείας μοντέλο για ένα ζεύγος, η μετάφραση γίνεται μέσω αγγλικών.
Κάθε τίτλος μεταφράζεται μία φορά και αποθηκεύεται στο data/fantasy/headlines.json (πεδίο i18n). Αν μια γλώσσα
δεν υποστηρίζεται, ο τίτλος μένει στο πρωτότυπο (και η σελίδα το δείχνει).

    pip install ctranslate2 sentencepiece
    python fantasy/translate_heads.py
"""
from __future__ import annotations

import html
import json
import os
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HEADS = ROOT / "data" / "fantasy" / "headlines.json"
INDEX = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"
CACHE = Path(os.environ.get("ARGOS_CACHE", Path.home() / ".cache" / "bs-argos"))
TARGETS = ["el", "en", "es", "sr", "tr"]
MAX_NEW = 120   # όριο τίτλων ανά εκτέλεση (χρόνος)


def log(*a):
    print("[translate]", *a, flush=True)


def prep(t: str) -> str:
    """Λέξεις ολόκληρες σε κεφαλαία (π.χ. «ΒΑΣΙΛΙΑΣ», «ΘΗΡΙΟ») τα μοντέλα τις αφήνουν αμετάφραστες ή τις μπερδεύουν:
    γίνονται πεζά με κεφαλαίο το πρώτο γράμμα. Οι συντομογραφίες (MVP, NBA, ≤ 3 γράμματα) μένουν ως έχουν."""
    return re.sub(r"\b([^\W\d_]{4,})\b", lambda m: m.group(1).capitalize() if m.group(1).isupper() else m.group(1), t)


def detect(title: str, feed_lang: str) -> str:
    """Γλώσσα του τίτλου: ελληνικοί χαρακτήρες → el, τουρκικοί (ğ ş ı İ) → tr, αλλιώς η γλώσσα του feed."""
    if re.search(r"[Ͱ-Ͽἀ-῿]", title):
        return "el"
    if re.search(r"[ğşıİĞŞ]", title):
        return "tr"
    return feed_lang or "en"


class Argos:
    def __init__(self):
        self.index = None
        self.models = {}
        CACHE.mkdir(parents=True, exist_ok=True)

    def load_index(self):
        if self.index is None:
            f = CACHE / "index.json"
            try:
                with urllib.request.urlopen(urllib.request.Request(INDEX, headers={"User-Agent": "ArgosTranslate"}), timeout=30) as r:
                    f.write_bytes(r.read())
            except Exception as e:
                log("index: δεν κατέβηκε,", e, "(χρησιμοποιείται το αποθηκευμένο αν υπάρχει)")
            self.index = json.loads(f.read_text(encoding="utf-8")) if f.exists() else []
            self.pairs = {(p["from_code"], p["to_code"]): p for p in self.index}
            log(f"ζεύγη διαθέσιμα: {len(self.pairs)}")
        return self.index

    def has(self, a, b):
        self.load_index()
        return (a, b) in self.pairs

    def model(self, a, b):
        if (a, b) in self.models:
            return self.models[(a, b)]
        import ctranslate2
        import sentencepiece as spm
        p = self.pairs[(a, b)]
        d = CACHE / f"{a}_{b}_{p.get('package_version', '0')}"
        if not d.exists():
            z = CACHE / f"{a}_{b}.zip"
            log(f"λήψη μοντέλου {a}→{b}: {len(p.get('links') or [])} links")
            last = None
            for u in (p.get("links") or []):   # δοκιμάζει όλους τους mirrors
                try:
                    req = urllib.request.Request(u, headers={"User-Agent": "ArgosTranslate"})
                    with urllib.request.urlopen(req, timeout=120) as r, open(z, "wb") as fo:
                        fo.write(r.read())
                    last = None
                    break
                except Exception as e:
                    last = e
                    log(f"  {u}: {e}")
            if last:
                raise last
            with zipfile.ZipFile(z) as zf:
                zf.extractall(d)
            z.unlink()
        # το zip περιέχει έναν φάκελο με model/ (CTranslate2), sentencepiece.model, metadata.json
        root = next((x for x in [d, *d.iterdir()] if (x / "model").exists()), d)
        meta = {}
        try:
            meta = json.loads((root / "metadata.json").read_text(encoding="utf-8"))
        except Exception:
            pass
        tr = ctranslate2.Translator(str(root / "model"), device="cpu", inter_threads=2)
        sp = spm.SentencePieceProcessor(model_file=str(root / "sentencepiece.model"))
        self.models[(a, b)] = (tr, sp, meta.get("target_prefix") or "")
        return self.models[(a, b)]

    def translate_batch(self, texts, a, b):
        tr, sp, prefix = self.model(a, b)
        toks = [sp.encode(prep(t), out_type=str) for t in texts]
        kw = {"target_prefix": [[prefix]] * len(toks)} if prefix else {}
        res = tr.translate_batch(toks, beam_size=4, max_decoding_length=160, replace_unknowns=True, **kw)
        out = []
        for r in res:
            t = r.hypotheses[0]
            if prefix and t and t[0] == prefix:
                t = t[1:]
            out.append(html.unescape(sp.decode(t).replace("▁", " ").strip()))
        return out

    def translate(self, texts, a, b):
        if a == b:
            return texts
        if b == "sr" and not self.has("en", "sr") and not self.has(a, "sr"):
            # σερβικά (λατινικά): αν δεν υπάρχει μοντέλο, κροατικά ή βοσνιακά (σχεδόν ίδια γλώσσα στη λατινική γραφή)
            for alt in ("hr", "bs"):
                if self.has("en", alt) or self.has(a, alt):
                    return self.translate(texts, a, alt)
        if self.has(a, b):
            return self.translate_batch(texts, a, b)
        if a != "en" and b != "en" and self.has(a, "en") and self.has("en", b):
            return self.translate_batch(self.translate_batch(texts, a, "en"), "en", b)
        return None


def main():
    try:
        import ctranslate2  # noqa: F401
        import sentencepiece  # noqa: F401
    except ImportError:
        log("λείπουν τα ctranslate2/sentencepiece, παραλείπεται")
        return
    d = json.loads(HEADS.read_text(encoding="utf-8")) if HEADS.exists() else {"items": []}
    A = Argos()
    A.load_index()
    todo = [x for x in d["items"] if any((x.get("i18n") or {}).get(t) is None for t in TARGETS)][:MAX_NEW]
    if not todo:
        log("τίποτα νέο")
        return
    unsupported = set()
    groups = {}
    for x in todo:
        x["src_lang"] = x.get("src_lang") or detect(x["title"], x.get("lang", "en"))
        x.setdefault("i18n", {})
        for t in TARGETS:
            if x["i18n"].get(t) is None:
                groups.setdefault((x["src_lang"], t), []).append(x)
    for (a, b), xs in groups.items():
        try:
            out = A.translate([x["title"] for x in xs], a, b)
        except Exception as e:
            log(f"{a}→{b}: σφάλμα {e}")
            out = None
        if out is None:
            unsupported.add(f"{a}→{b}")
            for x in xs:
                x["i18n"][b] = None   # δεν υποστηρίζεται: η σελίδα δείχνει το πρωτότυπο
            continue
        for x, t in zip(xs, out):
            x["i18n"][b] = x["title"] if a == b else t
    HEADS.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
    log(f"{len(todo)} τίτλοι · ζεύγη {len(groups)}" + (f" · χωρίς μοντέλο: {', '.join(sorted(unsupported))}" if unsupported else ""))


if __name__ == "__main__":
    sys.exit(main())
