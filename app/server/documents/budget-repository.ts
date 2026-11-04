import type {DocumentProviderOutcome} from "./provider";
import {settleProviderOutcome} from "../../../worker/document-executor/job-state";
export type DocumentReservationInput={id:string;jobId:string;ownerId:string;amount:number;userLimit:number;globalLimit:number;priceVersion:string};
export type DocumentReservation={id:string;owner_id:string;job_id:string;state:"reserved"|"settled"|"released"|"held-unknown";reserved_micro_usd:number;actual_micro_usd:number|null;receipt_id:string|null};
const charged="CASE WHEN state='settled' THEN actual_micro_usd WHEN state IN ('reserved','held-unknown') THEN reserved_micro_usd ELSE 0 END";
export class DocumentBudgetRepository{
 constructor(private readonly db:D1Database,private readonly now:()=>number=Date.now){}
 reserveStatement(input:DocumentReservationInput,guardSql="1",guardBindings:unknown[]=[]):D1PreparedStatement{
  if(![input.amount,input.userLimit,input.globalLimit].every(value=>Number.isSafeInteger(value)&&value>=0))throw new Error("unavailable");
  const now=this.now(),day=new Date(now).toISOString().slice(0,10);
  return this.db.prepare(`INSERT INTO document_budget_reservations(id,owner_id,job_id,day,reserved_micro_usd,state,price_version,created_at,updated_at) SELECT ?,?,?,?,?,'reserved',?,?,? WHERE ? + COALESCE((SELECT SUM(${charged}) FROM document_budget_reservations WHERE owner_id=? AND (day=? OR state IN ('reserved','held-unknown'))),0) <= ? AND ? + COALESCE((SELECT SUM(${charged}) FROM document_budget_reservations WHERE day=? OR state IN ('reserved','held-unknown')),0) <= ? AND (${guardSql})`).bind(input.id,input.ownerId,input.jobId,day,input.amount,input.priceVersion,now,now,input.amount,input.ownerId,day,input.userLimit,input.amount,day,input.globalLimit,...guardBindings);
 }
 async reserve(input:DocumentReservationInput){return (await this.reserveStatement(input).run()).meta.changes===1;}
 async get(jobId:string){return this.db.prepare("SELECT * FROM document_budget_reservations WHERE job_id=?").bind(jobId).first<DocumentReservation>();}
 async settle(jobId:string,outcome:DocumentProviderOutcome):Promise<DocumentReservation>{
  const decision=settleProviderOutcome(outcome),now=this.now();
  const receipt=decision.accounting==="settled"&&outcome.kind==="received"?outcome.receiptId:null;
  const actual=decision.accounting==="settled"&&outcome.kind==="received"?outcome.actualMicroUsd:null;
  await this.db.batch([
   this.db.prepare("UPDATE document_budget_reservations SET state=?,actual_micro_usd=?,receipt_id=?,updated_at=? WHERE job_id=? AND state IN ('reserved','held-unknown')").bind(decision.accounting,actual,receipt,now,jobId),
   this.db.prepare(`UPDATE document_jobs SET dispatch_state=CASE WHEN (SELECT state FROM document_budget_reservations WHERE job_id=?)='settled' THEN 'settled' WHEN (SELECT state FROM document_budget_reservations WHERE job_id=?)='released' THEN 'not-sent' ELSE 'may-have-sent' END,execution_slot=CASE WHEN (SELECT state FROM document_budget_reservations WHERE job_id=?) IN ('settled','released') THEN NULL ELSE execution_slot END,updated_at=? WHERE id=?`).bind(jobId,jobId,jobId,now,jobId),
  ]);
  const reservation=await this.get(jobId);if(!reservation)throw new Error("not-found");
  if(receipt&&reservation.state==="settled"&&(reservation.receipt_id!==receipt||reservation.actual_micro_usd!==actual))throw new Error("conflict");
  return reservation;
 }
}

