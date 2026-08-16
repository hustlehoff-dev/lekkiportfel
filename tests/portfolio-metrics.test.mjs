import assert from "node:assert/strict";
import test from "node:test";
import { calculateOpenResult } from "../lib/portfolio-metrics.ts";

test("open result reports full cost coverage",()=>{
  const result=calculateOpenResult([
    {symbol:"XTB",cost:1000,value:1250,costKnown:true},
    {symbol:"PKO",cost:500,value:450,costKnown:true},
  ]);

  assert.equal(result.totalValue,1700);
  assert.equal(result.coveredValue,1700);
  assert.equal(result.coveragePercent,100);
  assert.equal(result.isComplete,true);
  assert.deepEqual(result.missingCostSymbols,[]);
  assert.equal(result.cost,1500);
  assert.equal(result.value,1700);
  assert.equal(result.profit,200);
  assert.equal(result.returnPercent,200/1500*100);
});

test("open result excludes unknown costs and identifies partial result",()=>{
  const result=calculateOpenResult([
    {symbol:"XTB",cost:1000,value:1200,costKnown:true},
    {symbol:"USDT",cost:0,value:800,costKnown:false},
    {symbol:"USDT",cost:0,value:200,costKnown:false},
  ]);

  assert.equal(result.totalValue,2200);
  assert.equal(result.coveredValue,1200);
  assert.equal(result.coveragePercent,1200/2200*100);
  assert.equal(result.isComplete,false);
  assert.deepEqual(result.missingCostSymbols,["USDT"]);
  assert.equal(result.cost,1000);
  assert.equal(result.value,1200);
  assert.equal(result.profit,200);
  assert.equal(result.returnPercent,20);
  assert.equal(result.included.length,1);
  assert.equal(result.excluded.length,2);
});

test("partially covered grouped instruments are calculated from their positions",()=>{
  const known={symbol:"XTB",cost:1000,value:1300,costKnown:true};
  const unknown={symbol:"XTB",cost:0,value:700,costKnown:false};
  const result=calculateOpenResult([
    {symbol:"XTB",cost:1000,value:2000,costKnown:false,items:[known,unknown]},
  ]);

  assert.equal(result.totalValue,2000);
  assert.equal(result.coveredValue,1300);
  assert.equal(result.coveragePercent,65);
  assert.equal(result.cost,1000);
  assert.equal(result.profit,300);
  assert.equal(result.returnPercent,30);
  assert.deepEqual(result.included,[known]);
  assert.deepEqual(result.excluded,[unknown]);
  assert.deepEqual(result.missingCostSymbols,["XTB"]);
});

test("empty portfolio is complete while unknown zero-value rows are not",()=>{
  const empty=calculateOpenResult([]);
  assert.equal(empty.totalValue,0);
  assert.equal(empty.coveragePercent,100);
  assert.equal(empty.isComplete,true);
  assert.equal(empty.returnPercent,null);

  const unknown=calculateOpenResult([{symbol:"USDC",cost:0,value:0,costKnown:false}]);
  assert.equal(unknown.coveragePercent,0);
  assert.equal(unknown.isComplete,false);
  assert.deepEqual(unknown.missingCostSymbols,["USDC"]);
});
