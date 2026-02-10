"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface UploadCardProps {
  onSubmit: (file: File, storesPerDay: number) => void;
  isLoading: boolean;
}

export function UploadCard({ onSubmit, isLoading }: UploadCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [storesPerDay, setStoresPerDay] = useState(20);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.name.endsWith(".csv") || f.type === "text/csv") {
      setFile(f);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Upload Store List</CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload a CSV with store addresses to optimize your route
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          className={`
            flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors
            ${isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
          `}
        >
          {file ? (
            <>
              <FileText className="size-8 text-primary" />
              <span className="text-sm font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                Click or drag to replace
              </span>
            </>
          ) : (
            <>
              <Upload className="size-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                Drag & drop your CSV here
              </span>
              <span className="text-xs text-muted-foreground">
                or click to browse files
              </span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>

        {/* Stores per day */}
        <div className="flex items-center gap-3">
          <label htmlFor="stores-per-day" className="text-sm font-medium whitespace-nowrap">
            Stores per day:
          </label>
          <Input
            id="stores-per-day"
            type="number"
            min={1}
            max={200}
            value={storesPerDay}
            onChange={(e) => setStoresPerDay(parseInt(e.target.value) || 20)}
            className="w-20"
          />
        </div>

        {/* Submit */}
        <Button
          className="w-full"
          disabled={!file || isLoading}
          onClick={() => file && onSubmit(file, storesPerDay)}
        >
          {isLoading ? (
            <>
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Optimizing...
            </>
          ) : (
            "Optimize Route"
          )}
        </Button>

        {isLoading && (
          <p className="text-xs text-center text-muted-foreground">
            Geocoding addresses... This may take a few minutes on first run.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
