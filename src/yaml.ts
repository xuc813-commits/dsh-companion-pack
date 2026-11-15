import yaml from 'js-yaml';
export function parsePreset(content:string): any[] {
  const expression=new yaml.Type('tag:yaml.org,2002:js',{kind:'scalar',construct:(value:string)=>({__jsExpr:value})});
  const result=yaml.load(content,{schema:yaml.DEFAULT_SCHEMA.extend([expression])});if(!Array.isArray(result))throw Error('预设内容不是插件列表');return result;
}
