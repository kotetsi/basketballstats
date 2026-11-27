import test from 'node:test';
import assert from 'node:assert/strict';
import { fitLogisticCalibration, applyLogisticCalibration, fitIsotonicCalibration, applyIsotonicCalibration, scoreProbabilities } from '../src/odds/calibration.mjs';

test('logistic calibration learns a monotonic mapping and returns bounded probabilities', () => {
  const data = Array.from({length:200},(_,i)=>({p:(i+1)/202,y:i>=119?1:0}));
  const model = fitLogisticCalibration(data);
  assert.ok(model);
  assert.ok(applyLogisticCalibration(0.8,model)>applyLogisticCalibration(0.2,model));
  assert.ok(applyLogisticCalibration(0.5,model)>0 && applyLogisticCalibration(0.5,model)<1);
});
test('isotonic calibration is monotonic and bounded', () => {
  const data = Array.from({length:200},(_,i)=>({p:(i+1)/202,y:i>=99?1:0}));
  const model = fitIsotonicCalibration(data,10);
  assert.ok(model);
  const values=[0.1,0.3,0.5,0.7,0.9].map(p=>applyIsotonicCalibration(p,model));
  for(let i=1;i<values.length;i++) assert.ok(values[i]>=values[i-1]);
  assert.ok(values.every(p=>p>0&&p<1));
});
test('probability scores are calculated on the same sample', () => {
  assert.deepEqual(scoreProbabilities([{p:0.5,y:1},{p:0.5,y:0}]),{n:2,logLoss:0.693147,brier:0.25});
});
