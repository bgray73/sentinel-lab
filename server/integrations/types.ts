export type ServiceNowOperation='INSERT'|'UPDATE'|'NO_CHANGE'|'ERROR'|'SIMULATED';
export type ServiceNowMapping={ciId:string;sysId?:string;className:string;operation:ServiceNowOperation;error?:string;syncedAt:string};
export type ServiceNowSyncRun={id:string;mode:'simulation'|'live';status:'completed'|'partial'|'failed';startedAt:string;finishedAt:string;items:number;relationships:number;inserted:number;updated:number;unchanged:number;failed:number;deferredRelationships:number};
export type ServiceNowChange={id:string;ciId:string;number:string;sysId?:string;status:'simulated'|'created'|'failed';shortDescription:string;startsAt:string;endsAt:string;createdAt:string;url?:string;error?:string};
export type ServiceNowData={mappings:ServiceNowMapping[];runs:ServiceNowSyncRun[];changes:ServiceNowChange[]};
