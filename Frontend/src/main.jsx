import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import api from "./api";
import "./styles.css";

const getUser = () => {
  try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
};

function Protected({ children, roles }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function Layout({ children }) {
  const user = getUser();
  const navigate = useNavigate();

  function logout() {
    localStorage.clear();
    navigate("/login");
  }

  return (
    <>
      <header>
        <Link className="brand" to="/dashboard">StoreRate</Link>
        <div className="nav-right">
          <span>{user?.name}</span>
          <span className="role">{user?.role?.replaceAll("_", " ")}</span>
          <button className="secondary" onClick={() => navigate("/password")}>Change Password</button>
          <button onClick={logout}>Logout</button>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}

function AuthPage({ register = false }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name:"", email:"", password:"", address:"" });
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const url = register ? "/auth/register" : "/auth/login";
      const { data } = await api.post(url, form);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/dashboard");
    } catch (err) {
      const errors = err.response?.data?.errors;
      setError(errors ? Object.values(errors).join(" ") : err.response?.data?.message || "Something went wrong.");
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>{register ? "Create Account" : "Login"}</h1>
        {error && <div className="error">{error}</div>}
        {register && (
          <>
            <label>Name (20–60 characters)</label>
            <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required />
            <label>Address</label>
            <textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})} />
          </>
        )}
        <label>Email</label>
        <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required />
        <label>Password</label>
        <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required />
        <button>{register ? "Sign Up" : "Login"}</button>
        {register
          ? <p>Already registered? <Link to="/login">Login</Link></p>
          : <p>New user? <Link to="/register">Create an account</Link></p>}
      </form>
    </div>
  );
}

function Dashboard() {
  const user = getUser();
  if (user?.role === "SYSTEM_ADMIN") return <AdminDashboard />;
  if (user?.role === "STORE_OWNER") return <OwnerDashboard />;
  return <UserDashboard />;
}

function AdminDashboard() {
  const [stats,setStats] = useState({});
  const [users,setUsers] = useState([]);
  const [stores,setStores] = useState([]);
  const [search,setSearch] = useState("");
  const [role,setRole] = useState("");
  const [tab,setTab] = useState("users");
  const [sort,setSort] = useState("name");
  const [direction,setDirection] = useState("asc");
  const [message,setMessage] = useState("");

  async function load() {
    const [s,u,st] = await Promise.all([
      api.get("/admin/dashboard"),
      api.get("/admin/users",{params:{search,role,sort,direction}}),
      api.get("/admin/stores",{params:{search,sort,direction}})
    ]);
    setStats(s.data); setUsers(u.data); setStores(st.data);
  }
  useEffect(()=>{load().catch(e=>setMessage(e.response?.data?.message || "Could not load dashboard."));},[search,role,sort,direction]);

  function sortBy(field) {
    if (sort === field) setDirection(direction === "asc" ? "desc" : "asc");
    else { setSort(field); setDirection("asc"); }
  }

  return (
    <Layout>
      <h1>Admin Dashboard</h1>
      {message && <div className="error">{message}</div>}
      <div className="stats">
        <div className="stat"><b>{stats.users ?? 0}</b><span>Total Users</span></div>
        <div className="stat"><b>{stats.stores ?? 0}</b><span>Total Stores</span></div>
        <div className="stat"><b>{stats.ratings ?? 0}</b><span>Total Ratings</span></div>
      </div>

      <div className="toolbar">
        <button className={tab==="users"?"active":""} onClick={()=>setTab("users")}>Users</button>
        <button className={tab==="stores"?"active":""} onClick={()=>setTab("stores")}>Stores</button>
        <Link className="button" to="/admin/add-user">Add User</Link>
        <Link className="button" to="/admin/add-store">Add Store</Link>
      </div>

      <div className="filters">
        <input placeholder="Search name, email, address..." value={search} onChange={e=>setSearch(e.target.value)} />
        {tab==="users" && (
          <select value={role} onChange={e=>setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="NORMAL_USER">Normal User</option>
            <option value="STORE_OWNER">Store Owner</option>
            <option value="SYSTEM_ADMIN">Admin</option>
          </select>
        )}
      </div>

      {tab==="users" ? (
        <table>
          <thead><tr>
            <th onClick={()=>sortBy("name")}>Name ↕</th>
            <th onClick={()=>sortBy("email")}>Email ↕</th>
            <th onClick={()=>sortBy("address")}>Address ↕</th>
            <th onClick={()=>sortBy("role")}>Role ↕</th>
            <th>Rating</th><th>Details</th>
          </tr></thead>
          <tbody>{users.map(u=><tr key={u.id}>
            <td>{u.name}</td><td>{u.email}</td><td>{u.address || "-"}</td>
            <td>{u.role.replaceAll("_"," ")}</td><td>{u.rating ?? "-"}</td>
            <td><Link to={`/admin/users/${u.id}`}>View</Link></td>
          </tr>)}</tbody>
        </table>
      ) : (
        <table>
          <thead><tr>
            <th onClick={()=>sortBy("name")}>Name ↕</th>
            <th>Email</th>
            <th onClick={()=>sortBy("address")}>Address ↕</th>
            <th onClick={()=>sortBy("rating")}>Rating ↕</th>
          </tr></thead>
          <tbody>{stores.map(s=><tr key={s.id}>
            <td>{s.name}</td><td>{s.email || "-"}</td><td>{s.address}</td><td>{s.rating}</td>
          </tr>)}</tbody>
        </table>
      )}
    </Layout>
  );
}

function AddUser() {
  const navigate = useNavigate();
  const [form,setForm]=useState({name:"",email:"",password:"",address:"",role:"NORMAL_USER"});
  const [error,setError]=useState("");

  async function submit(e) {
    e.preventDefault();
    try { await api.post("/admin/users",form); navigate("/dashboard"); }
    catch(e){ setError(e.response?.data?.errors ? Object.values(e.response.data.errors).join(" ") : e.response?.data?.message); }
  }
  return <Layout><FormCard title="Add User" form={form} setForm={setForm} error={error} onSubmit={submit} includeRole /></Layout>;
}

function AddStore() {
  const navigate = useNavigate();
  const [form,setForm]=useState({name:"",email:"",address:"",ownerId:""});
  const [owners,setOwners]=useState([]);
  const [error,setError]=useState("");
  useEffect(()=>{api.get("/admin/users",{params:{role:"STORE_OWNER"}}).then(r=>setOwners(r.data));},[]);
  async function submit(e) {
    e.preventDefault();
    try { await api.post("/admin/stores",form); navigate("/dashboard"); }
    catch(e){ setError(e.response?.data?.message); }
  }
  return (
    <Layout><form className="card form-card" onSubmit={submit}>
      <h2>Add Store</h2>{error&&<div className="error">{error}</div>}
      <label>Store Name</label><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
      <label>Email</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
      <label>Address</label><textarea required value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>
      <label>Store Owner</label>
      <select value={form.ownerId} onChange={e=>setForm({...form,ownerId:e.target.value})}>
        <option value="">No owner</option>{owners.map(o=><option key={o.id} value={o.id}>{o.name} - {o.email}</option>)}
      </select>
      <button>Create Store</button>
    </form></Layout>
  );
}

function FormCard({title,form,setForm,error,onSubmit,includeRole}) {
  return <form className="card form-card" onSubmit={onSubmit}>
    <h2>{title}</h2>{error&&<div className="error">{error}</div>}
    <label>Name (20–60 characters)</label><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
    <label>Email</label><input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
    <label>Password (8–16, uppercase + special)</label><input required type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>
    <label>Address</label><textarea value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>
    {includeRole&&<><label>Role</label><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>
      <option value="NORMAL_USER">Normal User</option><option value="STORE_OWNER">Store Owner</option><option value="SYSTEM_ADMIN">System Administrator</option>
    </select></>}
    <button>Create</button>
  </form>
}

function UserDashboard() {
  const [stores,setStores]=useState([]);
  const [search,setSearch]=useState("");
  const [message,setMessage]=useState("");
  const [sort,setSort]=useState("name");
  const [direction,setDirection]=useState("asc");

  async function load(){ const r=await api.get("/stores",{params:{search,sort,direction}});setStores(r.data); }
  useEffect(()=>{load().catch(e=>setMessage(e.response?.data?.message));},[search,sort,direction]);

  async function rate(storeId,current) {
    const value=window.prompt(`Enter rating for this store (1-5):`,current ?? "");
    if (value===null) return;
    const n=Number(value);
    if (!Number.isInteger(n)||n<1||n>5) return setMessage("Rating must be a whole number from 1 to 5.");
    try { await api.post("/ratings",{storeId,rating:n}); setMessage("Rating saved."); load(); }
    catch(e){setMessage(e.response?.data?.message || "Could not save rating.");}
  }

  function sortBy(field){if(sort===field)setDirection(direction==="asc"?"desc":"asc");else{setSort(field);setDirection("asc");}}

  return <Layout>
    <h1>Stores</h1>
    {message&&<div className="notice">{message}</div>}
    <div className="filters"><input placeholder="Search by store name or address..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <table><thead><tr>
      <th onClick={()=>sortBy("name")}>Store Name ↕</th>
      <th onClick={()=>sortBy("address")}>Address ↕</th>
      <th onClick={()=>sortBy("rating")}>Overall Rating ↕</th>
      <th onClick={()=>sortBy("userRating")}>Your Rating ↕</th><th>Action</th>
    </tr></thead>
    <tbody>{stores.map(s=><tr key={s.id}>
      <td>{s.name}</td><td>{s.address}</td><td>{s.overall_rating}</td><td>{s.user_rating ?? "Not rated"}</td>
      <td><button onClick={()=>rate(s.id,s.user_rating)}>{s.user_rating ? "Modify Rating" : "Rate"}</button></td>
    </tr>)}</tbody></table>
  </Layout>
}

function OwnerDashboard() {
  const [data,setData]=useState({store:null,users:[]});
  useEffect(()=>{api.get("/owner/dashboard").then(r=>setData(r.data));},[]);
  return <Layout>
    <h1>Store Owner Dashboard</h1>
    {!data.store ? <div className="card"><p>No store is assigned to your account.</p></div> : <>
      <div className="stats"><div className="stat"><b>{data.store.average_rating}</b><span>Average Rating</span></div></div>
      <div className="card"><h2>{data.store.name}</h2><p>{data.store.address}</p></div>
      <h2>Users Who Submitted Ratings</h2>
      <table><thead><tr><th>Name</th><th>Email</th><th>Address</th><th>Rating</th><th>Updated</th></tr></thead>
      <tbody>{data.users.map(u=><tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.address||"-"}</td><td>{u.rating}</td><td>{new Date(u.updated_at).toLocaleString()}</td></tr>)}</tbody></table>
    </>}
  </Layout>
}

function UserDetails() {
  const id=location.pathname.split("/").pop();
  const [user,setUser]=useState(null);
  useEffect(()=>{api.get(`/admin/users/${id}`).then(r=>setUser(r.data));},[id]);
  if(!user)return <Layout><p>Loading...</p></Layout>;
  return <Layout><div className="card"><h2>User Details</h2><p><b>Name:</b> {user.name}</p><p><b>Email:</b> {user.email}</p><p><b>Address:</b> {user.address||"-"}</p><p><b>Role:</b> {user.role.replaceAll("_"," ")}</p>{user.role==="STORE_OWNER"&&<p><b>Rating:</b> {user.rating}</p>}</div></Layout>
}

function PasswordPage() {
  const [form,setForm]=useState({currentPassword:"",newPassword:""});
  const [message,setMessage]=useState("");
  async function submit(e){e.preventDefault();try{await api.put("/auth/password",form);setMessage("Password updated successfully.");setForm({currentPassword:"",newPassword:""});}catch(e){setMessage(e.response?.data?.message||"Update failed.");}}
  return <Layout><form className="card form-card" onSubmit={submit}><h2>Change Password</h2>{message&&<div className="notice">{message}</div>}
    <label>Current Password</label><input type="password" required value={form.currentPassword} onChange={e=>setForm({...form,currentPassword:e.target.value})}/>
    <label>New Password</label><input type="password" required value={form.newPassword} onChange={e=>setForm({...form,newPassword:e.target.value})}/>
    <button>Update Password</button>
  </form></Layout>
}

function App(){
  return <Routes>
    <Route path="/login" element={<AuthPage/>}/>
    <Route path="/register" element={<AuthPage register/>}/>
    <Route path="/dashboard" element={<Protected><Dashboard/></Protected>}/>
    <Route path="/password" element={<Protected><PasswordPage/></Protected>}/>
    <Route path="/admin/add-user" element={<Protected roles={["SYSTEM_ADMIN"]}><AddUser/></Protected>}/>
    <Route path="/admin/add-store" element={<Protected roles={["SYSTEM_ADMIN"]}><AddStore/></Protected>}/>
    <Route path="/admin/users/:id" element={<Protected roles={["SYSTEM_ADMIN"]}><UserDetails/></Protected>}/>
    <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
  </Routes>
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter><App/></BrowserRouter>
);
