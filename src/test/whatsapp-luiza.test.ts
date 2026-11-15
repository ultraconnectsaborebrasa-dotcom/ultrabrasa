import {test,expect} from 'vitest';import {ruleParse} from '@/lib/whatsapp-rulebot';
const e={customer:'',type:null,items:[],address:{street:'',number:'',neighborhood:'',complement:'',reference:'',city:''},payment:null,cashFor:null,requestedTime:'',summarySent:false,quotedTotal:0} as any;
test('luiza',()=>{const r=ruleParse('Maria Luiza rua Floripa casa um bairro santa Isabel, pagamento no Pix',e,'m',['nome','rua','número','bairro','forma de pagamento']).draft;
expect(r.customer).toBe('Maria Luiza');expect(r.address.number).toBe('1');expect(r.address.street).toBe('rua Floripa');expect(r.address.neighborhood).toBe('santa Isabel');
expect(ruleParse('Casa 1',e,'m',['número']).draft.address.number).toBe('1');expect(ruleParse('Casa um',e,'m',['número']).draft.address.number).toBe('1');});
