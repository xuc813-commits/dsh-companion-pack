export interface QqProcess {pid:number;path:string;startedAt:string;visible:boolean;}
export function compatibleProcess(p:QqProcess,executable?:string){
  const normalized=(path:string)=>path.replaceAll('\\','/').toLowerCase();
  const path=normalized(String(p.path));
  return executable ? path===normalized(executable) : path.endsWith('/qq.exe');
}
export function chooseQqProcess(processes:QqProcess[],choice?:{pid:number;startedAt:string},executable?:string):QqProcess|undefined {
  const allowed=processes.filter(p=>compatibleProcess(p,executable));
  if(choice){const selected=allowed.find(p=>p.pid===choice.pid&&p.startedAt===choice.startedAt);if(!selected)throw Error('所选 QQ 已退出或重启，请重新选择');return selected;}
  if(allowed.length>1)throw Error('检测到多个 QQ，请选择要连接的窗口');
  if(processes.length&&allowed.length===0)throw Error('请打开已配置的 QQ 客户端');
  return allowed[0];
}
