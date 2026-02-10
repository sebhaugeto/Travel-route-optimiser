"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DownloadButtonProps {
  csvBase64: string | null;
  disabled: boolean;
}

export function DownloadButton({ csvBase64, disabled }: DownloadButtonProps) {
  const handleDownload = () => {
    if (!csvBase64) return;

    const csvContent = atob(csvBase64);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "optimized_route.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={handleDownload}
      className="gap-2"
    >
      <Download className="size-4" />
      Download CSV
    </Button>
  );
}
