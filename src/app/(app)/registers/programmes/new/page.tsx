import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { isRegisterManager } from "@/lib/registers";
import { notFound } from "next/navigation";
import { ProgrammeForm } from "../programme-form";
export default async function NewProgramme({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile } = await requireProfile();
  if (!isRegisterManager(profile)) notFound();
  const { error } = await searchParams;
  return (
    <div className="space-y-5">
      <Link href="/registers" className="btn btn-secondary">
        All registers
      </Link>
      <section className="card p-5">
        <h1 className="text-3xl font-black">Create regular programme</h1>
        {error ? <p role="alert">{error}</p> : null}
        <ProgrammeForm />
      </section>
    </div>
  );
}
