import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from translate_heads import detect  # noqa: E402


class TestDetect(unittest.TestCase):
    def test_lang(self):
        self.assertEqual(detect("Βασιλιάς Παναθηναϊκός στη Μαδρίτη", "en"), "el")
        self.assertEqual(detect("Fenerbahçe Maçı Öncesi Baskonia: Üç Eksik", "en"), "tr")
        self.assertEqual(detect("Booker fuori, Bolmaro atteso", "it"), "it")
        self.assertEqual(detect("Partizan's one-man show", "en"), "en")


if __name__ == "__main__":
    unittest.main()
