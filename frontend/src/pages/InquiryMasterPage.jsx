import React, { useState } from 'react';
import { FileText, Plus, Workflow, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import VersionedMasterPage from '../components/VersionedMasterPage';
import InquiryStatusMaster from '../components/InquiryStatusMaster';
import { PageHeader } from '../components/ui';

export default function InquiryMasterPage(){
  const navigate=useNavigate();
  const [section,setSection]=useState('form');
  const [statusEditorOpen,setStatusEditorOpen]=useState(false);
  const [statusAddRequest,setStatusAddRequest]=useState(0);
  return <div className="fade-in">
    <PageHeader title="Inquiry Master" description="Manage inquiry form versions and the inquiry status workflow." action={<div className="flex max-w-full flex-nowrap items-center justify-end gap-2 overflow-x-auto pb-1">
      <button type="button" onClick={()=>{setSection('form');setStatusEditorOpen(false);}} className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${section==='form'?'border-blue-600 bg-blue-600 text-white shadow-sm':'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}><FileText size={15}/> Inquiry Form Versions</button>
      <button type="button" onClick={()=>setSection('status')} className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${section==='status'?'border-violet-600 bg-violet-600 text-white shadow-sm':'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'}`}><Workflow size={15}/> Inquiry Status</button>
      {section==='form' ? (
        <button type="button" onClick={()=>navigate('/masters/inquiry/new')} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-amber-600 bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"><Plus size={15}/> New Version</button>
      ) : (
        <button type="button" onClick={()=>{if(statusEditorOpen)setStatusEditorOpen(false);else{setStatusAddRequest((value)=>value+1);setStatusEditorOpen(true);}}} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-amber-600 bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700">{statusEditorOpen?<X size={15}/>:<Plus size={15}/>} {statusEditorOpen?'Close':'Add Status'}</button>
      )}
    </div>}/>
    {section==='status' ? <InquiryStatusMaster editorOpen={statusEditorOpen} onEditorOpenChange={setStatusEditorOpen} addRequest={statusAddRequest} hideEditorToggle/> : <VersionedMasterPage type="inquiry" showHeader={false} showStandaloneAction={false} showActiveSummary={false}/>} 
  </div>;
}
