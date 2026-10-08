"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import type { Learner, NominationDetail } from "@/types/api";

const learnerSchema = z.object({
  employee_id: z
    .string()
    .trim()
    .min(4, "At least 4 characters")
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]{3,29}$/, "Letters, digits and hyphens only"),
  full_name: z.string().trim().min(2, "Enter the full name"),
  email: z.string().trim().email("Enter a valid email"),
  mobile: z
    .string()
    .trim()
    .regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit mobile number")
    .or(z.literal("")),
  designation: z.string().trim().min(2, "Designation is required for eligibility"),
  qualification: z.string().min(1, "Select qualification"),
  location: z.string().trim().optional(),
  department_id: z.string().optional(),
});

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("new"),
    learner: learnerSchema,
    course_id: z.string().min(1, "Select a course"),
    training_mode: z.enum(["Digital", "Physical", "Hybrid"]),
    justification: z.string().max(1000).optional(),
  }),
  z.object({
    mode: z.literal("existing"),
    learner_id: z.string().min(1, "Select a learner"),
    course_id: z.string().min(1, "Select a course"),
    training_mode: z.enum(["Digital", "Physical", "Hybrid"]),
    justification: z.string().max(1000).optional(),
  }),
]);
type FormValues = z.infer<typeof schema>;

export function NominationForm({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (n: NominationDetail) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "ADMIN";
  const courses = useApi<{ id: number; code: string; title: string }[]>(open ? "/courses/options" : null);
  const quals = useApi<string[]>(open ? "/learners/qualifications" : null);
  const depts = useApi<{ id: number; code: string; name: string }[]>(open && isAdmin ? "/departments/options" : null);
  const learners = useApi<Learner[]>(open ? "/learners" : null);
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: "new",
      course_id: "",
      training_mode: "Digital",
      justification: "",
      learner: { employee_id: "", full_name: "", email: "", mobile: "", designation: "", qualification: "", location: "", department_id: "" },
    } as FormValues,
  });
  const mode = watch("mode");
  const lerr = (errors as any).learner ?? {};

  const submit = (submitNow: boolean) =>
    handleSubmit(async (v) => {
      setError(null);
      try {
        const body: Record<string, unknown> = {
          course_id: Number(v.course_id),
          training_mode: v.training_mode,
          justification: v.justification || null,
          submit: submitNow,
        };
        if (v.mode === "existing") body.learner_id = Number(v.learner_id);
        else {
          if (isAdmin && !v.learner.department_id) {
            setError("Select the learner's department");
            return;
          }
          body.new_learner = {
            ...v.learner,
            mobile: v.learner.mobile || null,
            location: v.learner.location || null,
            department_id: v.learner.department_id ? Number(v.learner.department_id) : null,
          };
        }
        const res = await api<NominationDetail>("/nominations", { body });
        toast.success(submitNow ? "Nomination submitted to NIELIT" : "Nomination saved as draft", `${res.nomination_no} · ${res.learner.full_name}`);
        reset();
        onCreated(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create nomination");
      }
    });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="New Learner Nomination"
      description="Nominate an officer for a programme course. Submitted nominations go to NIELIT for eligibility review and approval."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={submit(false)} loading={isSubmitting}>Save as draft</Button>
          <Button variant="primary" onClick={submit(true)} loading={isSubmitting}>Create &amp; submit</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()} noValidate>
        {error && <Alert tone="bad">{error}</Alert>}
        <fieldset className="flex gap-4 text-[13px]">
          <legend className="sr-only">Learner</legend>
          <label className="flex items-center gap-2">
            <input type="radio" value="new" {...register("mode")} className="accent-[#1f5fbf]" /> New learner
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="existing" {...register("mode")} className="accent-[#1f5fbf]" /> Existing learner
          </label>
        </fieldset>

        {mode === "existing" ? (
          <Field label="Learner" htmlFor="learner_id" error={(errors as any).learner_id?.message} required>
            <Select id="learner_id" {...register("learner_id" as const)}>
              <option value="">Select learner…</option>
              {(learners.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.full_name} · {l.learner_code} · {l.department_code}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Employee / Learner ID" htmlFor="emp" error={lerr.employee_id?.message} required hint="e.g. SCIB-EMP-2045">
              <Input id="emp" {...register("learner.employee_id" as const)} aria-invalid={!!lerr.employee_id} />
            </Field>
            <Field label="Full name" htmlFor="fn" error={lerr.full_name?.message} required>
              <Input id="fn" {...register("learner.full_name" as const)} aria-invalid={!!lerr.full_name} />
            </Field>
            <Field label="Official email" htmlFor="em" error={lerr.email?.message} required>
              <Input id="em" type="email" {...register("learner.email" as const)} aria-invalid={!!lerr.email} />
            </Field>
            <Field label="Mobile" htmlFor="mob" error={lerr.mobile?.message}>
              <Input id="mob" inputMode="tel" {...register("learner.mobile" as const)} aria-invalid={!!lerr.mobile} />
            </Field>
            <Field label="Designation" htmlFor="des" error={lerr.designation?.message} required>
              <Input id="des" {...register("learner.designation" as const)} aria-invalid={!!lerr.designation} />
            </Field>
            <Field label="Qualification" htmlFor="qual" error={lerr.qualification?.message} required>
              <Select id="qual" {...register("learner.qualification" as const)} aria-invalid={!!lerr.qualification}>
                <option value="">Select…</option>
                {(quals.data ?? []).map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </Select>
            </Field>
            {isAdmin ? (
              <Field label="Department" htmlFor="dept" required>
                <Select id="dept" {...register("learner.department_id" as const)}>
                  <option value="">Select…</option>
                  {(depts.data ?? []).map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Department">
                <Input value={user?.department ?? ""} disabled readOnly />
              </Field>
            )}
            <Field label="Location" htmlFor="loc">
              <Input id="loc" {...register("learner.location" as const)} />
            </Field>
          </div>
        )}

        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Course" htmlFor="course" error={errors.course_id?.message} required>
            <Select id="course" {...register("course_id")} aria-invalid={!!errors.course_id}>
              <option value="">Select course…</option>
              {(courses.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Training mode" htmlFor="tm" required>
            <Select id="tm" {...register("training_mode")}>
              <option>Digital</option>
              <option>Physical</option>
              <option>Hybrid</option>
            </Select>
          </Field>
          <Field label="Justification" htmlFor="just" className="sm:col-span-2" hint="Why this officer should attend (optional)">
            <Textarea id="just" {...register("justification")} />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
