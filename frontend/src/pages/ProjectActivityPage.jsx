import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import ProjectActivityGraph from '../components/ProjectActivityGraph';
import { SecondaryButton } from '../components/ui';

export default function ProjectActivityPage(){
  const {id}=useParams();
  const navigate=useNavigate();
  const {data}=useStore();
  const project=(data.projects||[]).find((item)=>item.id===id);
  if(!project) return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">Project not found.</div>;
  return <div className="fade-in mx-auto max-w-[1500px]">
    <div className="mb-4 flex items-center gap-3"><SecondaryButton onClick={()=>navigate(`/projects/${id}/view`)}><ArrowLeft size={15}/> Back</SecondaryButton><div><h1 className="text-xl font-bold text-slate-900">Project Activity</h1><p className="text-sm text-slate-500">{project.project_no} · {project.project_name}</p></div></div>
    <ProjectActivityGraph project={project} auditLogs={data.auditLogs||[]} />
  </div>;
}
