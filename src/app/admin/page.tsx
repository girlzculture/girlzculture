import AdminDashboard from "@/components/AdminDashboard";
export default async function AdminPage({searchParams}:{searchParams:Promise<{preview?:string}>}){const {preview}=await searchParams;return <AdminDashboard section="overview" preview={process.env.NODE_ENV==="development"&&preview==="1"}/>}
