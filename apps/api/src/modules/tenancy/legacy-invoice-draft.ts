import {BadRequestException} from '@nestjs/common';
export type LegacyDraft = {
 id:string; invoiceNumber:string; invoiceDate:string; invoiceType:string;currency:string;
 data:{items:Array<Record<string,unknown>>;details:Record<string,unknown>};
 [key:string]:unknown
};
const kind:Record<string,string>={
 invoice:'tax_invoice',tax_invoice:'tax_invoice',proforma:'proforma',estimate:'proforma',
 quotation:'proforma',credit_note:'credit_note',creditNote:'credit_note',
 bill_of_supply:'bill_of_supply',billOfSupply:'bill_of_supply',
 delivery_challan:'delivery_challan',deliveryChallan:'delivery_challan'
};
export function documentType(invoiceType:string):string|null {return kind[invoiceType]||null;}
export function financialYear(date:string):string {
 const year=Number(date.slice(0,4)),month=Number(date.slice(5,7));
 const start=month>=4?year:year-1;
 return String(start)+'-'+String((start+1)%100).padStart(2,'0');
}
export function validateLegacyDraft(raw:unknown):LegacyDraft {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Invalid invoice');
 const src=raw as Record<string,unknown>;
 const number=typeof src.invoiceNumber==='string'?src.invoiceNumber.trim():'';
 if(number.length<1||number.length>100||/[\x00-\x1f]/.test(number))
   throw new BadRequestException('Invalid invoice number');
 if(src.id!==number)throw new BadRequestException('Original invoice ID must match invoice number');
 const date=src.invoiceDate;
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
   Number.isNaN(Date.parse(date+'T00:00:00Z'))||
   new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)
   throw new BadRequestException('Invalid invoice date');
 if(typeof src.invoiceType!=='string'||!documentType(src.invoiceType))
   throw new BadRequestException('Unsupported invoice type');
 const currency=typeof src.currency==='string'?src.currency.toUpperCase():'INR';
 if(!/^[A-Z]{3}$/.test(currency))throw new BadRequestException('Invalid currency');
 // Only drafts can be persisted before statutory issuance, stock and tax validation.
 if(src.status!=='draft')throw new BadRequestException('Issuing or changing payment status is not available in the draft adapter');
 const data=src.data;
 if(!data||typeof data!=='object'||Array.isArray(data))throw new BadRequestException('Missing invoice data');
 const details=(data as Record<string,unknown>).details;
 const items=(data as Record<string,unknown>).items;
 if(!details||typeof details!=='object'||Array.isArray(details)||
   !Array.isArray(items)||items.length===0||items.length>200)
   throw new BadRequestException('Invalid invoice items');
 for(const item of items){
   if(!item||typeof item!=='object'||Array.isArray(item))throw new BadRequestException('Invalid line item');
   const line=item as Record<string,unknown>;
   const quantity=Number(line.quantity),price=Number(line.rate);
   if(!Number.isFinite(quantity)||quantity<=0||quantity>1e7||
     !Number.isFinite(price)||price<0||price>1e10)
      throw new BadRequestException('Invalid line quantity or rate');
   if(typeof line.name!=='string'||!line.name.trim()||line.name.length>500)
      throw new BadRequestException('Invalid line description');
 }
 if(JSON.stringify(src).length>200_000)throw new BadRequestException('Invoice draft too large');
 return {...src,id:number,invoiceNumber:number,invoiceDate:date,invoiceType:src.invoiceType,currency,
   data:{...(data as Record<string,unknown>),items:items as Array<Record<string,unknown>>,details:details as Record<string,unknown>}} as LegacyDraft;
}
