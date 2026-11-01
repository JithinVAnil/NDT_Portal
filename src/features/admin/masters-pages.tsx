"use client";

import * as React from "react";
import { Pencil, Plus } from "lucide-react";
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
import type { Trainer, TrainingVenue } from "@/types/api";

const EMPTY_VENUE = { code: "", name: "", city: "", address: "", capacity: "40", facilities: "", is_active: true };
const EMPTY_TRAINER = { code: "", full_name: "", email: "", expertise: "", organization: "", is_active: true };

export function VenuesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<TrainingVenue[]>("/masters/venues");
  const [edit, setEdit] = React.useState<Partial<TrainingVenue> | null>(null);
  const [form, setForm] = React.useState(EMPTY_VENUE);
  const [err, setErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const open = (v?: TrainingVenue) => {
    setErr(null);
    setEdit(v ?? {});
    setForm(
      v
        ? { code: v.code, name: v.name, city: v.city ?? "", address: v.address ?? "", capacity: String(v.capacity),
            facilities: v.facilities ?? "", is_active: v.is_active }
        : EMPTY_VENUE,
    );
  };
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = { ...form, capacity: Number(form.capacity) || 40, address: form.address || null, city: form.city || null,
                     facilities: form.facilities || null };
      if (edit?.id) await api(`/masters/venues/${edit.id}`, { method: "PUT", body });
      else await api("/masters/venues", { body });
      toast.success(edit?.id ? "Venue updated" : "Venue created", form.name);
      setEdit(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<TrainingVenue>[] = [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-[12px] font-semibold">{row.original.code}</span> },
    { accessorKey: "name", header: "Venue",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-[11.5px] text-muted">{row.original.address}</p>
        </div>
      ) },
    { accessorKey: "city", header: "City" },
    { accessorKey: "capacity", header: "Capacity", cell: ({ row }) => <span className="tabular">{row.original.capacity}</span> },
    { accessorKey: "facilities", header: "Facilities" },
    { accessorKey: "batches", header: "Batches", cell: ({ row }) => <span className="tabular">{row.original.batches}</span> },
    { accessorKey: "is_active", header: "Status", cell: ({ row }) => <Badge tone={row.original.is_active ? "ok" : "neutral"}>{row.original.is_active ? "Active" : "Inactive"}</Badge> },
    { id: "edit", header: "", enableSorting: false,
      cell: ({ row }) => (
        <Button size="xs" variant="ghost" onClick={() => open(row.original)} aria-label={`Edit ${row.original.name}`}>
          <Pencil /> Edit
        </Button>
      ) },
  ];

  const set = (k: keyof typeof EMPTY_VENUE) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Training Venues"
        description="Physical centres where offline training is conducted."
        breadcrumbs={[{ label: "Administrator" }, { label: "Masters" }, { label: "Training Venues" }]}
        actions={<Button variant="primary" onClick={() => open()}><Plus /> Add venue</Button>}
      />
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : (
          <DataTable columns={columns} data={data ?? []} emptyTitle="No venues found." caption="Training venues" />
        )}
      </Card>
      <Dialog
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? "Edit venue" : "Add venue"}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}
      >
        {err && <Alert tone="bad" className="mb-3">{err}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" htmlFor="v-code" required><Input id="v-code" value={form.code} onChange={set("code")} /></Field>
          <Field label="Name" htmlFor="v-name" required><Input id="v-name" value={form.name} onChange={set("name")} /></Field>
          <Field label="City" htmlFor="v-city"><Input id="v-city" value={form.city} onChange={set("city")} /></Field>
          <Field label="Capacity" htmlFor="v-cap"><Input id="v-cap" type="number" min={1} value={form.capacity} onChange={set("capacity")} /></Field>
          <div className="sm:col-span-2">
            <Field label="Address" htmlFor="v-addr"><Input id="v-addr" value={form.address} onChange={set("address")} /></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Facilities" htmlFor="v-fac" hint="Comma-separated, e.g. Projector, Lab, Internet">
              <Input id="v-fac" value={form.facilities} onChange={set("facilities")} />
            </Field>
          </div>
          <div className="flex items-end pb-2">
            <Checkbox checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Active" />
          </div>
        </div>
      </Dialog>
    </>
  );
}

const PRESET_TRAINERS = [
  {
    code: "TRN-MEERA",
    full_name: "Dr. Meera Krishnan",
    email: "meera.krishnan@demo.local",
    expertise: "Cyber security awareness, security culture, threat landscape",
    organization: "Directorate of Digital Governance",
  },
  {
    code: "TRN-ROHIT",
    full_name: "Rohit Bansal",
    email: "rohit.bansal@demo.local",
    expertise: "Phishing analysis, email security, identity hygiene",
    organization: "State Cyber Investigation Bureau",
  },
  {
    code: "TRN-KAVYA",
    full_name: "Kavya Iyer",
    email: "kavya.iyer@demo.local",
    expertise: "IoT forensics, hardware interfacing, UART / JTAG extraction",
    organization: "Urban Smart City Authority",
  },
  {
    code: "TRN-ARVIND",
    full_name: "Arvind Menon",
    email: "arvind.menon@demo.local",
    expertise: "Embedded systems, firmware reverse engineering, physical acquisition",
    organization: "Transport & Logistics Directorate",
  },
  {
    code: "TRN-NEHA",
    full_name: "Neha Kulkarni",
    email: "neha.kulkarni@demo.local",
    expertise: "Cloud forensics, AWS/GCP investigations, container & k8s security",
    organization: "Department of Health Informatics",
  },
  {
    code: "TRN-VIKRAM",
    full_name: "Vikram Rathore",
    email: "vikram.rathore@demo.local",
    expertise: "Enterprise DFIR, incident response, active directory threat hunting",
    organization: "Directorate of Public Finance & Treasury",
  },
  {
    code: "TRN-FARAH",
    full_name: "Farah Siddiqui",
    email: "farah.siddiqui@demo.local",
    expertise: "Microsoft 365 investigations, KQL, SIEM & SOAR triage",
    organization: "Power & Utilities Directorate",
  },
  {
    code: "TRN-SAMEER",
    full_name: "Dr. Sameer Joshi",
    email: "sameer.joshi@demo.local",
    expertise: "Digital evidence handling, legal compliance, chain of custody",
    organization: "Directorate of Rural e-Services",
  },
  {
    code: "TRN-ANIL",
    full_name: "Anil Kumar",
    email: "anil.kumar@demo.local",
    expertise: "Network security forensics, packet analysis & intrusion detection",
    organization: "State Cyber Investigation Bureau",
  },
  {
    code: "TRN-PRIYA",
    full_name: "Dr. Priya Sundaram",
    email: "priya.sundaram@demo.local",
    expertise: "Malware analysis, sandbox detonation & reverse engineering",
    organization: "Directorate of Digital Governance",
  },
];

export function TrainersPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<Trainer[]>("/masters/trainers");
  const [edit, setEdit] = React.useState<Partial<Trainer> | null>(null);
  const [form, setForm] = React.useState(EMPTY_TRAINER);
  const [selectedPreset, setSelectedPreset] = React.useState<string>("");
  const [err, setErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const open = (t?: Trainer) => {
    setErr(null);
    setEdit(t ?? {});
    setSelectedPreset(t ? t.full_name : "");
    setForm(
      t
        ? { code: t.code, full_name: t.full_name, email: t.email ?? "", expertise: t.expertise ?? "",
            organization: t.organization ?? "", is_active: t.is_active }
        : EMPTY_TRAINER,
    );
  };

  const handlePresetSelect = (name: string) => {
    setSelectedPreset(name);
    if (!name || name === "custom") {
      setForm((prev) => ({ ...prev, full_name: name === "custom" ? "" : prev.full_name }));
      return;
    }
    const found = PRESET_TRAINERS.find((p) => p.full_name === name);
    if (found) {
      let codeToUse = found.code;
      if (data && data.some((item) => item.code === codeToUse && (!edit?.id || edit.id !== item.id))) {
        codeToUse = `${found.code}-${Math.floor(100 + Math.random() * 900)}`;
      }
      setForm({
        code: codeToUse,
        full_name: found.full_name,
        email: found.email,
        expertise: found.expertise,
        organization: found.organization,
        is_active: true,
      });
    }
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = { ...form, email: form.email || null, expertise: form.expertise || null, organization: form.organization || null };
      if (edit?.id) await api(`/masters/trainers/${edit.id}`, { method: "PUT", body });
      else await api("/masters/trainers", { body });
      toast.success(edit?.id ? "Trainer updated" : "Trainer created", form.full_name);
      setEdit(null);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnDef<Trainer>[] = [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-[12px] font-semibold">{row.original.code}</span> },
    { accessorKey: "full_name", header: "Trainer",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.full_name}</p>
          <p className="text-[11.5px] text-muted">{row.original.email}</p>
        </div>
      ) },
    { accessorKey: "expertise", header: "Expertise" },
    { accessorKey: "organization", header: "Organization" },
    { accessorKey: "batches", header: "Batches", cell: ({ row }) => <span className="tabular">{row.original.batches}</span> },
    { accessorKey: "is_active", header: "Status", cell: ({ row }) => <Badge tone={row.original.is_active ? "ok" : "neutral"}>{row.original.is_active ? "Active" : "Inactive"}</Badge> },
    { id: "edit", header: "", enableSorting: false,
      cell: ({ row }) => (
        <Button size="xs" variant="ghost" onClick={() => open(row.original)} aria-label={`Edit ${row.original.full_name}`}>
          <Pencil /> Edit
        </Button>
      ) },
  ];

  const set = (k: keyof typeof EMPTY_TRAINER) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        title="Trainers"
        description="Instructor master mapped to training batches."
        breadcrumbs={[{ label: "Administrator" }, { label: "Masters" }, { label: "Trainers" }]}
        actions={<Button variant="primary" onClick={() => open()}><Plus /> Add trainer</Button>}
      />
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : (
          <DataTable columns={columns} data={data ?? []} emptyTitle="No trainers found." caption="Trainers" />
        )}
      </Card>
      <Dialog
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? "Edit trainer" : "Add trainer"}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}
      >
        {err && <Alert tone="bad" className="mb-3">{err}</Alert>}

        {/* Quick select trainer profile banner */}
        {!edit?.id && (
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
            <Field label="Select from Qualified Instructors / SMEs" htmlFor="t-preset" hint="Choose a trainer to auto-fill their profile, modules of expertise, and contact details.">
              <Select
                id="t-preset"
                value={selectedPreset}
                onChange={(e) => handlePresetSelect(e.target.value)}
                className="bg-white font-medium text-navy-900"
              >
                <option value="">-- Choose Instructor / SME --</option>
                {PRESET_TRAINERS.map((p) => (
                  <option key={p.code} value={p.full_name}>
                    {p.full_name} — {p.expertise.split(",")[0]}
                  </option>
                ))}
                <option value="custom">+ Custom / Manual Entry</option>
              </Select>
            </Field>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" htmlFor="t-name" required>
            <Input id="t-name" placeholder="e.g. Dr. Rajesh Sharma" value={form.full_name} onChange={set("full_name")} />
          </Field>
          <Field label="Code" htmlFor="t-code" required hint="Unique trainer identifier (e.g., TRN-001)">
            <Input id="t-code" placeholder="e.g. TRN-RAJESH" value={form.code} onChange={set("code")} />
          </Field>
          <Field label="Email" htmlFor="t-email">
            <Input id="t-email" type="email" placeholder="e.g. instructor@demo.local" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Organization" htmlFor="t-org">
            <Input id="t-org" placeholder="e.g. Cyber Defense Academy" value={form.organization} onChange={set("organization")} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Area of Expertise / Module Domain" htmlFor="t-exp" hint="Subject areas or specialized technical modules this trainer delivers.">
              <Input id="t-exp" placeholder="e.g. Cloud forensics, AWS/GCP investigations" value={form.expertise} onChange={set("expertise")} />
            </Field>
          </div>
          <div className="flex items-end pb-2">
            <Checkbox checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Active status" />
          </div>
        </div>
      </Dialog>
    </>
  );
}
