export type GuestDrillStep={id:'preflight'|'archive'|'restore'|'isolate'|'boot'|'guest-agent'|'shutdown'|'destroy';name:string;status:'passed'|'failed'|'skipped';detail:string;durationMs:number};
export type GuestRecoveryDrill={id:string;mode:'simulation'|'live';sourceType:'qemu'|'lxc';sourceVmid:number;testVmid:number;archive:string;node:string;storage:string;startedAt:string;finishedAt:string;durationMs:number;status:'passed'|'failed';cleanupRequired:boolean;steps:GuestDrillStep[];error?:string};
export type GuestRecoveryData={drills:GuestRecoveryDrill[]};
