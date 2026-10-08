"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileUp, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { RiskBadge, StatusBadge } from "@/components/ui/badge";
import { Alert, ErrorState, LoadingBlock, ProgressBar } from "@/components/ui/states";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { pct } from "@/lib/utils";
import type { Learner, Role } from "@/types/api";
import { BulkImport } from "../nominations/bulk-import";

const schema = z.object({
  employee_id: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9-]{3,29}$/, "4–30 letters, digits or hyphens"),
  full_name: z.string().trim().min(2, "Enter the full name"),
  email: z.string().trim().email("Enter a valid email"),
  mobile: z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit mobile number").or(z.literal("")),
  designation: z.string().trim().min(2, "Enter designation"),
  qualification: z.string().min(1, "Select qualification"),
  location: z.string().optional(),
  department_id: z.string().optional(),
});
type F = z.infer<typeof schema>;

function AddLearner({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "ADMIN";
  const quals = useApi<string[]>(open ? "/learners/qualifications" : null);
  const depts = useApi<{ id: number; code: string; name: string }[]>(open && isAdmin ? "/departments/options" : null);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: { employee_id: "", full_name: "", email: "", mobile: "", designation: "", qualification: "", location: "", department_id: "" },
  });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const l = await api<Learner>("/learners", {
        body: { ...v, mobile: v.mobile || null, location: v.location || null, department_id: v.department_id ? Number(v.department_id) : null },
      });
      toast.success("Learner created", `${l.full_name} · ${l.learner_code}`);
      reset();
      onDone();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create learner");
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add learner"
      description="Register a learner record. Nominate them for a course from the Nominations page."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={onSubmit} loading={isSubmitting}>Create learner</Button>
        </>
      }
    >
      {error && <Alert tone="bad" className="mb-3">{error}</Alert>}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit} noValidate>
        <Field label="Employee ID" htmlFor="a-emp" error={errors.employee_id?.message} required>
          <Input id="a-emp" {...register("employee_id")} />
        </Field>
        <Field label="Full name" htmlFor="a-fn" error={errors.full_name?.message} required>
          <Input id="a-fn" {...register("full_name")} />
        </Field>
        <Field label="Email" htmlFor="a-em" error={errors.email?.message} required>
          <Input id="a-em" type="email" {...register("email")} />
        </Field>
        <Field label="Mobile" htmlFor="a-mob" error={errors.mobile?.message}>
          <Input id="a-mob" {...register("mobile")} />
        </Field>
        <Field label="Designation" htmlFor="a-des" error={errors.designation?.message} required>
          <Input id="a-des" {...register("designation")} />
        </Field>
        <Field label="Qualification" htmlFor="a-q" error={errors.qualification?.message} required>
          <Select id="a-q" {...register("qualification")}>
            <option value="">Select…</option>
            {(quals.data ?? []).map((q) => <option key={q}>{q}</option>)}
          </Select>
        </Field>
        {isAdmin && (
          <Field label="Department" htmlFor="a-d" required>
            <Select id="a-d" {...register("department_id")}>
              <option value="">Select…</option>
              {(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Location" htmlFor="a-loc">
          <Input id="a-loc" {...register("location")} />
        </Field>
      </form>
    </Dialog>
  );
}

export function LearnersPage({ role }: { role: Role }) {
  const router = useRouter();
  const base = role === "ADMIN" ? "/admin" : "/department";
  const [dept, setDept] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [openAdd, setOpenAdd] = React.useState(false);
  const [openImport, setOpenImport] = React.useState(false);
  const { data, error, loading, reload } = useApi<Learner[]>("/learners", { department_id: dept, status });
  const depts = useApi<{ id: number; code: string; name: string }[]>(role === "ADMIN" ? "/departments/options" : null);

  const columns: ColumnDef<Learner>[] = [
    { accessorKey: "learner_code", header: "Learner ID", cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.learner_code}</span> },
    {
      accessorKey: "full_name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.full_name}</p>
          <p className="text-[11.5px] text-muted">{row.original.designation}</p>
        </div>
      ),
    },
    { accessorKey: "employee_id", header: "Employee ID" },
    ...(role === "ADMIN" ? [{ accessorKey: "department_code", header: "Dept" } as ColumnDef<Learner>] : []),
    { accessorKey: "course", header: "Course", cell: ({ row }) => row.original.course ?? <span className="text-subtle">—</span> },
    {
      accessorKey: "progress",
      header: "Progress",
      cell: ({ row }) =>
        row.original.progress === null || row.original.progress === undefined ? (
          <span className="text-subtle">—</span>
        ) : (
          <div className="flex w-28 items-center gap-2">
            <ProgressBar value={row.original.progress} size="sm" />
            <span className="tabular text-[12px]">{pct(row.original.progress)}</span>
          </div>
        ),
    },
    { accessorKey: "attendance", header: "Attendance", cell: ({ row }) => <span className="tabular">{pct(row.original.attendance)}</span> },
    { accessorKey: "risk_level", header: "Risk", cell: ({ row }) => <RiskBadge level={row.original.risk_level} /> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Learners"
        description={role === "ADMIN" ? "All learners across departments." : "Learners registered by your department."}
        breadcrumbs={[{ label: role === "ADMIN" ? "Administrator" : "Department" }, { label: "Learners" }]}
        actions={
          <>
            <Button variant="outline" onClick={() => setOpenImport(true)}>
              <FileUp /> Bulk upload
            </Button>
            <Button variant="primary" onClick={() => setOpenAdd(true)}>
              <UserPlus /> Add learner
            </Button>
          </>
        }
      />
      <Card>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingBlock rows={8} />
        ) : (
          <DataTable
            columns={columns}
            data={data ?? []}
            searchPlaceholder="Search name, ID, email…"
            emptyTitle="No learners found."
            onRowClick={(l) => router.push(`${base}/learners/${l.id}`)}
            caption="Learners"
            toolbar={
              <>
                {role === "ADMIN" && (
                  <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-56" aria-label="Filter by department">
                    <option value="">All departments</option>
                    {(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                  </Select>
                )}
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44" aria-label="Filter by status">
                  <option value="">All statuses</option>
                  {["Registered", "Nominated", "Approved", "Allocated", "Onboarded", "Completed"].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </>
            }
          />
        )}
      </Card>
      <AddLearner open={openAdd} onOpenChange={setOpenAdd} onDone={reload} />
      <BulkImport open={openImport} onOpenChange={setOpenImport} onDone={reload} />
    </>
  );
}
