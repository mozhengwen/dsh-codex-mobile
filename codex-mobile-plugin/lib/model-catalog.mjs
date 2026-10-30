export function desktopModelCatalog(tools) {
  const tool=[...tools.values()].find(t=>t.name==='create_thread'||t.name.endsWith('__create_thread'))
  const description=tool?.inputSchema?.properties?.model?.description||''
  return [...description.matchAll(/([a-zA-Z0-9][\w.-]+) \(([^)]*?); supported reasoning efforts: ([^)]+)\)/g)].map(m=>({provider:'codex',id:m[1],name:m[1],efforts:m[3].split(',').map(e=>({id:e.trim(),name:e.trim()}))}))
}
export function validateSelection(models,selection) {
  const model=models.find(m=>m.id===selection.model&&m.provider===selection.provider)
  if(!model)throw new Error('该模型当前不可用，请重新加载模型列表')
  if(selection.reasoningEffort&&!model.efforts.some(e=>e.id===selection.reasoningEffort))throw new Error('该模型不支持所选思考等级')
  return {provider:model.provider,model:model.id,...(selection.reasoningEffort?{reasoningEffort:selection.reasoningEffort}:{})}
}
