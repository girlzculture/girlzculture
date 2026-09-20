export type CommunicationChoices={email_enabled:boolean;sms_enabled:boolean;push_enabled:boolean;reminders:boolean;follow_up:boolean;marketing:boolean;locale:string;consent_version:1};
export type CommunicationPreferences=CommunicationChoices&{revision:number;scope:"business"|"booking"};
export const communicationFlags=["email_enabled","sms_enabled","push_enabled","reminders","follow_up","marketing"] as const;
export const communicationUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function communicationUpdate(input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))throw Error("COMMUNICATION_INVALID");
 const body=input as Record<string,unknown>;
 if(Object.keys(body).length!==3||!communicationUuid.test(String(body.request_id))||!Number.isSafeInteger(body.expected_revision)||Number(body.expected_revision)<0)throw Error("COMMUNICATION_INVALID");
 const choices=body.choices as Record<string,unknown>;
 if(!choices||typeof choices!=="object"||Array.isArray(choices)||Object.keys(choices).length!==8||communicationFlags.some(key=>typeof choices[key]!=="boolean")||choices.consent_version!==1||!["en","fr","es","zh-CN"].includes(String(choices.locale)))throw Error("COMMUNICATION_INVALID");
 return {requestId:String(body.request_id),revision:Number(body.expected_revision),choices:choices as CommunicationChoices};
}
