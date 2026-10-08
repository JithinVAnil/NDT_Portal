"use client";

import * as React from "react";
import { Pencil, Plus, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Alert, ErrorState, LoadingBlock } from "@/components/ui/states";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime } from "@/lib/utils";

interface Dept {
  id: number;
  code: string;
  name: string;
  ministry: string | null;
  category: string | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  is_active: boolean;
  learners: number;
  nominations: number;
  in_charges: string[];
}

const EMPTY = { code: "", name: "", ministry: "", category: "", location: "", contact_name: "", contact_email: "", is_active: true };

export function DepartmentsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Dept[]>("/departments");
  const [edit, setEdit] = React.useState<Partial<Dept> | null>(null);
  const [form, setForm] = React.useState<typeof EMPTY>(EMPTY);
  const [err, setErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const open = (d?: Dept) => {
    setErr(null);
    setEdit(d ?? {});
    setForm(
      d
        ? {
            code: d.code, name: d.name, ministry: d.ministry ?? "", category: d.category ?? "", location: d.location ?? "",
            contact_name: d.contact_name ?? "", contact_email: d.contact_email ?? "", is_active: d.is_active,
          }
        : EMPTY,
    );
  };
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = { ...form, contact_email: form.contact_email || null };
      if (edit?.id) await api(`/departments/${edit.id}`, { method: "PUT", body });
      else await api("/departments", { body });
      toast.success(edit?.id ? "Department updated" : "Department created", form.name);
      setEdit(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<Dept>[] = [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-[12px] font-semibold">{row.original.code}</span> },
    {
      accessorKey: "name",
      header: "Department",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-[11.5px] text-muted">{row.original.ministry}</p>
        </div>
      ),
    },
    { accessorKey: "category", header: "Category" },
    { accessorKey: "location", header: "Location" },
    { id: "incharge", accessorFn: (d) => d.in_charges.join(", "), header: "In-Charge" },
    { accessorKey: "learners", header: "Learners", cell: ({ row }) => <span className="tabular">{row.original.learners}</span> },
    { accessorKey: "nominations", header: "Nominations", cell: ({ row }) => <span className="tabular">{row.original.nominations}</span> },
    { accessorKey: "is_active", header: "Status", cell: ({ row }) => <Badge tone={row.original.is_active ? "ok" : "neutral"}>{row.original.is_active ? "Active" : "Inactive"}</Badge> },
    {
      id: "edit",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button size="xs" variant="ghost" onClick={() => open(row.original)} aria-label={`Edit ${row.original.name}`}>
          <Pencil /> Edit
        </Button>
      ),
    },
  ];

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Departments"
        description="Fictional nominating government departments (demo data)."
        breadcrumbs={[{ label: "Administrator" }, { label: "Departments" }]}
        actions={<Button variant="primary" onClick={() => open()}><Plus /> Add department</Button>}
      />
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : (
          <DataTable columns={columns} data={data ?? []} emptyTitle="No departments found." caption="Departments" />
        )}
      </Card>
      <Dialog
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? "Edit department" : "Add department"}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}
      >
        {err && <Alert tone="bad" className="mb-3">{err}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" htmlFor="d-code" required><Input id="d-code" value={form.code} onChange={set("code")} /></Field>
          <Field label="Name" htmlFor="d-name" required><Input id="d-name" value={form.name} onChange={set("name")} /></Field>
          <Field label="Ministry" htmlFor="d-min"><Input id="d-min" value={form.ministry} onChange={set("ministry")} /></Field>
          <Field label="Category" htmlFor="d-cat"><Input id="d-cat" value={form.category} onChange={set("category")} /></Field>
          <Field label="Location" htmlFor="d-loc"><Input id="d-loc" value={form.location} onChange={set("location")} /></Field>
          <Field label="Contact name" htmlFor="d-cn"><Input id="d-cn" value={form.contact_name} onChange={set("contact_name")} /></Field>
          <Field label="Contact email" htmlFor="d-ce"><Input id="d-ce" value={form.contact_email} onChange={set("contact_email")} /></Field>
          <div className="flex items-end pb-2">
            <Checkbox checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Active" />
          </div>
        </div>
      </Dialog>
    </>
  );
}

interface U {
  id: number;
  email: string;
  full_name: string;
  role: string;
  role_name: string;
  department: string | null;
  department_code: string | null;
  designation: string | null;
  is_active: boolean;
  last_login_at: string | null;
}

export function UsersPage() {
  const toast = useToast();
  const [role, setRole] = React.useState("");
  const { data, error, loading, reload } = useApi<U[]>("/users", { role });
  const depts = useApi<{ id: number; code: string; name: string }[]>("/departments/options");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ email: "", full_name: "", role: "DEPARTMENT", department_id: "", designation: "", password: "" });
  const [err, setErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const toggle = async (u: U) => {
    try {
      await api(`/users/${u.id}`, { method: "PUT", body: { is_active: !u.is_active } });
      toast.success(u.is_active ? "User deactivated" : "User activated", u.email);
      reload();
    } catch (e) {
      toast.error("Update failed", e instanceof Error ? e.message : undefined);
    }
  };
  const create = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api("/users", {
        body: {
          email: form.email, full_name: form.full_name, role: form.role,
          department_id: form.department_id ? Number(form.department_id) : null,
          designation: form.designation || null, password: form.password || null,
        },
      });
      toast.success("User created", form.email);
      setOpen(false);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create user");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<U>[] = [
    { accessorKey: "full_name", header: "Name", cell: ({ row }) => <div><p className="font-medium">{row.original.full_name}</p><p className="text-[11.5px] text-muted">{row.original.designation}</p></div> },
    { accessorKey: "email", header: "Email" },
    { accessorKey: "role_name", header: "Role", cell: ({ row }) => <Badge tone={row.original.role === "ADMIN" ? "navy" : row.original.role === "DEPARTMENT" ? "info" : "neutral"}>{row.original.role_name}</Badge> },
    { accessorKey: "department_code", header: "Dept", cell: ({ row }) => row.original.department_code ?? "—" },
    { accessorKey: "last_login_at", header: "Last login", cell: ({ row }) => fmtDateTime(row.original.last_login_at) },
    { accessorKey: "is_active", header: "Status", cell: ({ row }) => <Badge tone={row.original.is_active ? "ok" : "neutral"} dot>{row.original.is_active ? "Active" : "Inactive"}</Badge> },
    {
      id: "act",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button size="xs" variant="ghost" onClick={() => toggle(row.original)}>
          {row.original.is_active ? "Deactivate" : "Activate"}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="Portal accounts and roles. Learner accounts are created automatically at onboarding."
        breadcrumbs={[{ label: "Administrator" }, { label: "Users" }]}
        actions={<Button variant="primary" onClick={() => { setErr(null); setOpen(true); }}><UserPlus /> Add user</Button>}
      />
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : (
          <DataTable
            columns={columns}
            data={data ?? []}
            caption="Users"
            toolbar={
              <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-52" aria-label="Filter by role">
                <option value="">All roles</option>
                <option value="ADMIN">NIELIT Administrator</option>
                <option value="DEPARTMENT">Department In-Charge</option>
                <option value="LEARNER">Learner</option>
              </Select>
            }
          />
        )}
      </Card>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add user"
        description="Create an Administrator or Department In-Charge account. If no password is entered, the demo password is used."
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={create}>Create user</Button></>}
      >
        {err && <Alert tone="bad" className="mb-3">{err}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="u-n" required><Input id="u-n" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="u-e" required><Input id="u-e" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Role" htmlFor="u-r" required>
            <Select id="u-r" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="DEPARTMENT">Department In-Charge</option>
              <option value="ADMIN">NIELIT Administrator</option>
            </Select>
          </Field>
          {form.role === "DEPARTMENT" && (
            <Field label="Department" htmlFor="u-d" required>
              <Select id="u-d" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                <option value="">Select…</option>
                {(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Designation" htmlFor="u-des"><Input id="u-des" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
          <Field label="Password (min 8 chars)" htmlFor="u-p" hint="Leave blank to use the demo password"><Input id="u-p" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
      </Dialog>
    </>
  );
}
