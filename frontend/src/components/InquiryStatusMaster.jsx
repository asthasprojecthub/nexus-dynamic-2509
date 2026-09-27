import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, LockKeyhole, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { useStore } from '../store';
import { Field, Input, PrimaryButton, SecondaryButton, Select, Status } from './ui';

const SYSTEM = new Set([
  'New','Technical Evaluation','Technical BoM Submitted','BoM Approval Pending','Revision',
  'Commercial BOM Submission','Order Won','Order Lost','Inquiry Hold',
]);

const emptyDraft = { status_name:'', behavior:'STANDARD', requires_popup:false, reason_options:'', popup_fields:[], is_active:true };
const fieldKey = () => `status_field_${Date.now()}_${Math.random().toString(16).slice(2,7)}`;
const emptyPopupField = () => ({ key:fieldKey(), label:'', type:'text', required:false, options:[], options_text:'' });

export default function InquiryStatusMaster({editorOpen,onEditorOpenChange,addRequest=0,hideEditorToggle=false}){
  const { data, refresh } = useStore();
  const [draft,setDraft]=useState(emptyDraft);
  const [editingId,setEditingId]=useState('');
  const [internalEditorOpen,setInternalEditorOpen]=useState(false);
  const showEditor=typeof editorOpen==='boolean'?editorOpen:internalEditorOpen;
  const setShowEditor=(open)=>{
    const next=typeof open==='function'?open(showEditor):open;
    if(typeof editorOpen==='boolean')onEditorOpenChange?.(next);
    else setInternalEditorOpen(next);
  };
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const rows=useMemo(()=>(data.inquiryStatuses||[]).slice().sort((a,b)=>(a.display_order||0)-(b.display_order||0)),[data.inquiryStatuses]);

  const reset=()=>{setDraft(emptyDraft);setEditingId('');setError('');setShowEditor(false);};
  const startAdd=()=>{setDraft({...emptyDraft,popup_fields:[]});setEditingId('');setError('');setShowEditor(true);};
  useEffect(()=>{
    if(!addRequest)return;
    setDraft({...emptyDraft,popup_fields:[]});
    setEditingId('');
    setError('');
  },[addRequest]);
  const edit=(row)=>{
    setEditingId(row.id);
    setDraft({
      status_name:row.status_name,
      behavior:row.behavior||'STANDARD',
      requires_popup:!!row.requires_popup,
      reason_options:(row.reason_options||[]).join(', '),
      popup_fields:Array.isArray(row.popup_fields)?row.popup_fields.map((field)=>({...field,options:Array.isArray(field.options)?field.options:[],options_text:Array.isArray(field.options)?field.options.join(', '):''})):[],
      is_active:row.is_active!==false,
    });
    setError('');
    setShowEditor(true);
  };
  const addPopupField=()=>setDraft((v)=>({...v,popup_fields:[...(v.popup_fields||[]),emptyPopupField()]}));
  const updatePopupField=(index,patch)=>setDraft((v)=>({...v,popup_fields:(v.popup_fields||[]).map((field,i)=>i===index?{...field,...patch}:field)}));
  const removePopupField=(index)=>setDraft((v)=>({...v,popup_fields:(v.popup_fields||[]).filter((_,i)=>i!==index)}));

  const submit=async(e)=>{
    e.preventDefault();
    if(!draft.status_name.trim()) return setError('Status name is required.');
    const invalidIndex=(draft.popup_fields||[]).findIndex((field)=>!String(field.label||'').trim());
    if(invalidIndex>=0){setError('Field label is required. Enter the field name before saving.');window.setTimeout(()=>document.querySelector(`[data-inquiry-status-field-label="${invalidIndex}"]`)?.focus(),0);return;}
    setSaving(true); setError('');
    const payload={
      status_name:draft.status_name.trim(),
      behavior:draft.behavior,
      requires_popup:draft.behavior==='REASON' ? true : !!draft.requires_popup,
      reason_options:draft.reason_options.split(',').map((item)=>item.trim()).filter(Boolean),
      popup_fields:(draft.popup_fields||[]).map((field)=>({
        key:field.key||fieldKey(),
        label:String(field.label||'').trim(),
        type:field.type||'text',
        required:!!field.required,
        options:String(field.options_text ?? (Array.isArray(field.options)?field.options.join(', '):'' )).split(',').map((item)=>item.trim()).filter(Boolean),
      })),
      is_active:!!draft.is_active,
    };
    try{
      if(editingId) await api(`/inquiry-statuses/${editingId}`,{method:'PATCH',body:JSON.stringify(payload)});
      else await api('/inquiry-statuses',{method:'POST',body:JSON.stringify(payload)});
      await refresh(); reset();
    }catch(err){setError(err.message||'Unable to save status.');}
    finally{setSaving(false);}
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-slate-900">Inquiry Status</h2>
        <p className="mt-0.5 text-xs text-slate-500">Protected workflow statuses continue to work as before. Custom statuses can use a dynamic popup with additional fields.</p>
      </div>
      {!hideEditorToggle&&<PrimaryButton type="button" onClick={showEditor?reset:startAdd}>{showEditor?<X size={14}/>:<Plus size={14}/>} {showEditor?'Close':'Add Status'}</PrimaryButton>}
    </div>

    {showEditor && <form onSubmit={submit} className="mb-4 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label={editingId?'Edit Status':'Status Name'} required>
          <Input value={draft.status_name} disabled={editingId && SYSTEM.has(draft.status_name)} onChange={(e)=>setDraft((v)=>({...v,status_name:e.target.value}))} placeholder="e.g. Customer Clarification" />
        </Field>
        <Field label="Popup Type">
          <Select value={draft.behavior} disabled={editingId && SYSTEM.has(draft.status_name)} onChange={(e)=>setDraft((v)=>({...v,behavior:e.target.value,requires_popup:e.target.value==='REASON'}))}>
            <option value="STANDARD">Simple status</option>
            <option value="REASON">Dynamic popup</option>
          </Select>
        </Field>
        <Field label="Reason Options">
          <Input value={draft.reason_options} disabled={draft.behavior!=='REASON' || (editingId && SYSTEM.has(draft.status_name))} onChange={(e)=>setDraft((v)=>({...v,reason_options:e.target.value}))} placeholder="Optional: Reason 1, Reason 2" />
        </Field>
        <div className="flex items-end gap-2">
          <PrimaryButton type="submit" disabled={saving || (editingId && SYSTEM.has(draft.status_name))}><Save size={14}/>{saving?'Saving…':editingId?'Save':'Add Status'}</PrimaryButton>
          {editingId && <SecondaryButton type="button" onClick={reset}><X size={14}/></SecondaryButton>}
        </div>
      </div>

      {draft.behavior==='REASON' && !(editingId && SYSTEM.has(draft.status_name)) && <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="text-sm font-bold text-slate-800">Popup Fields</p><p className="text-xs text-slate-500">Add the fields that should appear when this status is selected.</p></div>
          <SecondaryButton type="button" onClick={addPopupField}><Plus size={13}/> Add Field</SecondaryButton>
        </div>
        {(draft.popup_fields||[]).length===0 ? <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-xs text-slate-400">No extra fields. You can still use the Reason Options above.</div> : <div className="space-y-2">
          {(draft.popup_fields||[]).map((field,index)=><div key={field.key||index} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[1.35fr_.8fr_1.35fr_auto_auto]">
            <Input data-inquiry-status-field-label={index} value={field.label||''} onChange={(e)=>updatePopupField(index,{label:e.target.value})} placeholder="Field label" />
            <Select value={field.type||'text'} onChange={(e)=>updatePopupField(index,{type:e.target.value,options:['dropdown','radio','checkbox'].includes(e.target.value)?field.options||[]:[]})}>
              <option value="text">Text</option><option value="textarea">Textarea</option><option value="number">Number</option><option value="date">Date</option><option value="dropdown">Dropdown</option><option value="radio">Radio</option><option value="checkbox">Checkbox</option>
            </Select>
            <Input disabled={!['dropdown','radio','checkbox'].includes(field.type)} value={field.options_text ?? (field.options||[]).join(', ')} onChange={(e)=>updatePopupField(index,{options_text:e.target.value})} placeholder="Options separated by comma, e.g. Yes, No, Pending" />
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"><input type="checkbox" checked={!!field.required} onChange={(e)=>updatePopupField(index,{required:e.target.checked})}/> Required</label>
            <button type="button" onClick={()=>removePopupField(index)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove field"><Trash2 size={15}/></button>
          </div>)}
        </div>}
      </div>}
      {error && <p className="mt-2 text-xs font-medium text-rose-700">{error}</p>}
    </form>}

    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">Order</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Reasons / Fields</th><th className="px-3 py-2 text-left">State</th><th className="px-3 py-2 text-right">Action</th></tr></thead>
        <tbody>{rows.map((row)=><tr key={row.id} className="border-t border-slate-100">
          <td className="px-3 py-2 text-slate-500">{row.display_order}</td>
          <td className="px-3 py-2"><div className="flex items-center gap-2 font-semibold text-slate-800">{SYSTEM.has(row.status_name)&&<LockKeyhole size={13} className="text-blue-600"/>}{row.status_name}</div></td>
          <td className="px-3 py-2 text-slate-600">{row.behavior==='REASON'?'Dynamic popup':row.requires_popup?'Workflow popup':'Simple'}</td>
          <td className="px-3 py-2 text-xs text-slate-500"><div>{(row.reason_options||[]).join(', ')||'—'}</div>{(row.popup_fields||[]).length>0&&<div className="mt-0.5 font-semibold text-blue-700">{row.popup_fields.length} custom field{row.popup_fields.length===1?'':'s'}</div>}</td>
          <td className="px-3 py-2"><Status value={row.is_active!==false?'Active':'Inactive'}/></td>
          <td className="px-3 py-2 text-right">{SYSTEM.has(row.status_name)?<span className="text-[11px] font-semibold text-slate-400">Protected</span>:<button type="button" onClick={()=>edit(row)} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-700"><Pencil size={15}/></button>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
