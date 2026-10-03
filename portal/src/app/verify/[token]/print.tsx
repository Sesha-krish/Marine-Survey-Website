"use client";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Download className="h-4 w-4" aria-hidden /> Download PDF
    </Button>
  );
}
