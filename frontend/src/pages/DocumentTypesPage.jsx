import React, { useMemo, useState } from 'react';
import { Pencil, Plus, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { ConfirmDialog, Field, Input, matchesSearch, Modal, PageHeader, PrimaryButton, SearchBox, SecondaryButton, Status, Table } from '../components/ui';

const makeCode = (value = '') => String(value)
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 50);

const emptyForm = {
  title: '',
  is_active: true,
  subtypes: [{ id: '', name: '', code: '', is_active: true }],
};

export default function DocumentTypesPage(){
  const { data, refresh } = useStore();
  const [q,setQ] = useState('');
  const [open,setOpen] = useState(false);
  const [editing,setEditing] = useState(null);
  const [viewing,setViewing] = useState(null);
  const [form,setForm] = useState(emptyForm);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [pendingToggle,setPendingToggle] = useState(null);
  const [toggleError,setToggleError] = useState('');

  const allTypes = data.documentTypes || [];
  const roots = useMemo(() => allTypes.filter((item)=>!item.parent_document_type_id), [allTypes]);

  const rows = useMemo(() => {
    return roots.filter((root)=>{
      const children=allTypes.filter((item)=>item.parent_document_type_id===root.id);
      return matchesSearch([root.document_type_name, ...children.map((item)=>item.document_type_name)], q);
    });
  },[roots,allTypes,q]);

  const showCreate=()=>{
    setEditing(null);
    setError('');
    setForm(emptyForm);
    setOpen(true);
  };

  const showEdit=(root)=>{
    const children=allTypes.filter((item)=>item.parent_document_type_id===root.id);
    setEditing(root);
    setError('');
    setForm({
      title:root.document_type_name || '',
      is_active:root.is_active !== false,
      subtypes:children.length
        ? children.map((item)=>({ id:item.id, name:item.document_type_name || '', code:item.document_type_code || '', is_active:item.is_active !== false }))
        : [{ id:'', name:'', code:'', is_active:true }],
    });
    setOpen(true);
  };

  const setSubtype=(index,patch)=>setForm((current)=>({
    ...current,
    subtypes:current.subtypes.map((item,i)=>i===index?{...item,...patch}:item),
  }));

  const addSubtype=()=>setForm((current)=>({
    ...current,
    subtypes:[...current.subtypes,{ id:'', name:'', code:'', is_active:true }],
  }));

  const removeSubtype=(index)=>setForm((current)=>({
    ...current,
    subtypes:current.subtypes.filter((_,i)=>i!==index),
  }));

  const submit=async(event)=>{
    event.preventDefault();
    setError('');
    const title=form.title.trim();
    const enteredSubtypes=form.subtypes
      .map((item)=>({...item,name:item.name.trim()}))
      .filter((item)=>item.name);

    if(!title){ setError('Enter a document type, for example BOM or Drawing.'); return; }
    const duplicateNames = enteredSubtypes.map((item)=>item.name.toLowerCase());
    if(new Set(duplicateNames).size !== duplicateNames.length){ setError('Subtype names must be unique inside the same document type.'); return; }

    setSaving(true);
    try {
      let rootId=editing?.id;
      const rootCode=editing?.document_type_code || makeCode(title);

      if(editing){
        await api(`/document-types/${editing.id}`,{method:'PATCH',body:JSON.stringify({
          document_type_code:rootCode,
          document_type_name:title,
          parent_document_type_id:null,
          is_active:form.is_active,
        })});
      }else{
        const created=await api('/document-types',{method:'POST',body:JSON.stringify({
          document_type_code:rootCode,
          document_type_name:title,
          parent_document_type_id:null,
          is_active:form.is_active,
        })});
        rootId=created.id;
      }

      const existingChildren=editing ? allTypes.filter((item)=>item.parent_document_type_id===editing.id) : [];
      const keptIds=new Set();

      for(const subtype of enteredSubtypes){
        if(subtype.id){
          keptIds.add(subtype.id);
          await api(`/document-types/${subtype.id}`,{method:'PATCH',body:JSON.stringify({
            document_type_code:subtype.code || `${rootCode}_${makeCode(subtype.name)}`.slice(0,50),
            document_type_name:subtype.name,
            parent_document_type_id:rootId,
            is_active:subtype.is_active !== false,
          })});
        }else{
          await api('/document-types',{method:'POST',body:JSON.stringify({
            document_type_code:`${rootCode}_${makeCode(subtype.name)}`.slice(0,50),
            document_type_name:subtype.name,
            parent_document_type_id:rootId,
            is_active:true,
          })});
        }
      }

      for(const child of existingChildren){
        if(!keptIds.has(child.id)){
          await api(`/document-types/${child.id}`,{method:'PATCH',body:JSON.stringify({
            document_type_code:child.document_type_code,
            document_type_name:child.document_type_name,
            parent_document_type_id:rootId,
            is_active:false,
          })});
        }
      }

      await refresh();
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    }catch(err){
      setError(err.message || 'Unable to save document type.');
    }finally{
      setSaving(false);
    }
  };

  return <div className="fade-in">
    <PageHeader
      title="Document Type Master"
      description="Create one document type, then add all of its subtypes in the same form. Example: BOM → Technical BOM, Commercial BOM."
      action={<PrimaryButton onClick={showCreate}><Plus size={16}/>Add Document Type</PrimaryButton>}
    />
    {toggleError&&<div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{toggleError}</div>}
    <div className="mb-4"><SearchBox value={q} onChange={setQ} placeholder="Search document type or subtype…"/></div>

    <Table rows={rows} onRowClick={setViewing} columns={[
      {key:'document_type_name',label:'Document Type',render:(value)=><span className="font-semibold text-slate-900">{value}</span>},
      {key:'id',label:'Subtypes',render:(_,row)=>{
        const children=allTypes.filter((item)=>item.parent_document_type_id===row.id && item.is_active!==false);
        if(!children.length) return <span className="text-sm text-slate-400">No subtypes</span>;
        return <div className="flex flex-wrap gap-1.5">{children.map((item)=><span key={item.id} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{item.document_type_name}</span>)}</div>;
      }},
      {key:'is_active',label:'Status',render:(value)=><Status value={value?'Active':'Inactive'}/>},
      {key:'actions',label:'Actions',render:(_,row)=><div className="flex items-center justify-end gap-1">
        <button type="button" onClick={(event)=>{event.stopPropagation();showEdit(row);}} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700" title="Edit"><Pencil size={15}/></button>
        <button type="button" onClick={(event)=>{event.stopPropagation();setToggleError('');setPendingToggle(row);}} className={`rounded-lg p-1.5 transition ${row.is_active?'text-emerald-600 hover:bg-rose-50 hover:text-rose-600':'text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'}`} title={row.is_active?'Deactivate':'Activate'}>{row.is_active?<ToggleRight size={17}/>:<ToggleLeft size={17}/>}</button>
      </div>},
    ]}/>

    <ConfirmDialog
      open={!!pendingToggle}
      title={pendingToggle?.is_active?'Deactivate Document Type?':'Activate Document Type?'}
      message={pendingToggle ? `Are you sure you want to ${pendingToggle.is_active?'deactivate':'activate'} “${pendingToggle.document_type_name}”?` : ''}
      confirmLabel={pendingToggle?.is_active?'Deactivate':'Activate'}
      danger={!!pendingToggle?.is_active}
      onCancel={()=>setPendingToggle(null)}
      onConfirm={async()=>{
        const target=pendingToggle;
        setPendingToggle(null);
        if(!target)return;
        try{
          await api(`/document-types/${target.id}`,{method:'PATCH',body:JSON.stringify({
            document_type_code:target.document_type_code,
            document_type_name:target.document_type_name,
            parent_document_type_id:null,
            is_active:!target.is_active,
          })});
          await refresh();
        }catch(err){setToggleError(err.message || 'Unable to change document type status.');}
      }}
    />

    {viewing&&<Modal title={viewing.document_type_name} onClose={()=>setViewing(null)}>
      <div className="space-y-3 text-sm"><p><span className="font-semibold">Status:</span> {viewing.is_active?'Active':'Inactive'}</p><p className="font-semibold">Subtypes</p><ul className="space-y-1">{allTypes.filter(item=>item.parent_document_type_id===viewing.id).map(item=><li key={item.id} className="rounded-lg border px-3 py-2">{item.document_type_name} · {item.is_active?'Active':'Inactive'}</li>)}</ul></div>
      <div className="mt-4 flex justify-end"><SecondaryButton type="button" onClick={()=>setViewing(null)}>Close</SecondaryButton></div>
    </Modal>}

    {open&&<Modal title={editing?'Edit Document Type':'Add Document Type'} onClose={()=>!saving&&setOpen(false)}>
      <form onSubmit={submit} className="space-y-5">
        {error&&<div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        <Field label="Document Type" required>
          <Input
            required
            value={form.title}
            onChange={(e)=>setForm({...form,title:e.target.value})}
            placeholder="e.g. BOM, Drawing, Datasheet"
          />
          <p className="mt-1 text-[11px] text-slate-400">This is the main category users will select first.</p>
        </Field>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Subtypes</h4>
              <p className="mt-0.5 text-[11px] text-slate-400">Example for BOM: Technical BOM, Commercial BOM, Final BOM.</p>
            </div>
            <SecondaryButton type="button" onClick={addSubtype}><Plus size={14}/>Add Subtype</SecondaryButton>
          </div>

          <div className="space-y-2">
            {form.subtypes.map((item,index)=><div key={item.id||`new-${index}`} className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  value={item.name}
                  onChange={(e)=>setSubtype(index,{name:e.target.value})}
                  placeholder={`Subtype ${index+1}, e.g. ${form.title?.toLowerCase().includes('drawing')?'GA Drawing':'Technical BOM'}`}
                />
              </div>
              {form.subtypes.length>1&&<button type="button" onClick={()=>removeSubtype(index)} className="rounded-lg border border-slate-200 p-2.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove subtype"><X size={15}/></button>}
            </div>)}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <SecondaryButton type="button" disabled={saving} onClick={()=>setOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={saving}>{saving?'Saving…':editing?'Save Changes':'Create'}</PrimaryButton>
        </div>
      </form>
    </Modal>}
  </div>;
}
