import CustomerAccount from "@/components/CustomerAccount";
export default async function AccountPage({searchParams}:{searchParams:Promise<{preview?:string}>}){const {preview}=await searchParams;return <CustomerAccount preview={process.env.NODE_ENV==="development"&&preview==="1"}/>}
