import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {wechatMode,validateWindowsConfig,installWindowsConfig,windowsPreflight} from '../lib/windows-wechat.js';
const scratch=process.env.ROLEPLAY_TEST_ROOT;mkdirSync(scratch,{recursive:true});
test('existing profiles default to official login and invalid Windows selection never silently falls back',()=>{assert.equal(wechatMode(undefined),'ilink');assert.equal(wechatMode('windows'),'windows');assert.throws(()=>wechatMode('automatic'));});
test('Windows adapter requires a named account and explicit chats, with mention-only groups',()=>{
const c={account:'wxid_bot',selfId:'wxid_bot',dbDir:'D:/WechatData',chats:[{id:'allowed',name:'允许私聊'}]};assert.equal(validateWindowsConfig(c),c);assert.throws(()=>validateWindowsConfig({...c,account:'../other'}));assert.throws(()=>validateWindowsConfig({...c,chats:[]}));assert.throws(()=>validateWindowsConfig({...c,chats:[{id:'group@chatroom',name:'家庭群'}]}));assert.throws(()=>validateWindowsConfig({...c,chats:[...c.chats,...c.chats]}));});
test('imported adapter settings are copied and bound to this role without modifying source file or fixed process identity',()=>{
 const dir=mkdtempSync(join(scratch,'native-settings-')),input=join(dir,'original.json'),dest=join(dir,'managed','config.json');const c={account:'wxid_bot',selfId:'wxid_bot',dbDir:'D:/WechatData',moduleFile:'D:/another-role/wechat.json',processId:123,chats:[{id:'allowed',name:'私聊'}]};writeFileSync(input,JSON.stringify(c));installWindowsConfig(input,dest,'D:/this-role/wechat.json','D:/engine');const saved=JSON.parse(readFileSync(dest));assert.equal(saved.moduleFile,'D:/this-role/wechat.json');assert.equal(saved.processId,undefined);assert.equal(JSON.parse(readFileSync(input)).processId,123);assert.equal(saved.engineDir,'D:/engine');
});
test('Windows preflight reports missing components truthfully and rejects changed native binaries before any connection',()=>{
 const dir=mkdtempSync(join(scratch,'native-check-')),file=join(dir,'config.json'),python=join(dir,'python.exe'),source=join(dir,'bridge.cpp'),engine=join(dir,'engine');assert.equal(windowsPreflight(undefined,python,source).status,'needs_config');writeFileSync(file,JSON.stringify({account:'wxid_bot',selfId:'wxid_bot',dbDir:dir,chats:[{id:'allowed',name:'私聊'}],engineDir:engine}));writeFileSync(python,'fixture');mkdirSync(join(dir,'wxid_bot','db_storage'),{recursive:true});assert.equal(windowsPreflight(file,python,source).status,'missing_component');mkdirSync(engine);const dll=join(engine,'bridge.dll');writeFileSync(dll,'expected');writeFileSync(source,'original source');const hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');writeFileSync(join(engine,'current.json'),JSON.stringify({file:dll,sha256:hash(dll),sourceSha256:hash(source)}));assert.equal(windowsPreflight(file,python,source).ready,true);writeFileSync(dll,'changed');assert.equal(windowsPreflight(file,python,source).ready,false);
});
