import { Suspense } from "react";
import { CreateWizard } from "@/components/create/CreateWizard";

export default function CreatePage() {
  return (
    <Suspense>
      <CreateWizard />
    </Suspense>
  );
}
