import {test} from 'node:test';import assert from 'node:assert/strict';import {chooseQqProcess} from '../lib/qq-process.js';
const a={pid:1,path:'D:\\qq\\QQ.exe',startedAt:'a',visible:false},b={pid:2,path:'D:/qq/QQ.exe',startedAt:'b',visible:true};
test('multiple QQ windows require explicit choice and do not choose a foreground account implicitly',()=>{assert.throws(()=>chooseQqProcess([a,b]),/多个/);assert.equal(chooseQqProcess([a,b],{pid:2,startedAt:'b'}),b);});
test('remembered QQ binding rejects PID reuse and paths outside the installed client',()=>{assert.throws(()=>chooseQqProcess([a,b],{pid:2,startedAt:'old'}),/重新选择/);assert.throws(()=>chooseQqProcess([{...b,path:'C:/other/QQ.exe'}],{pid:2,startedAt:'b'},'D:/qq/QQ.exe'));assert.equal(chooseQqProcess([a]),a);});
