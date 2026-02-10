"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, Home } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProgressEvent, JourneyMode } from "@/lib/api";

const PRESET_ADDRESS = "Applebys Pl. 7, 1411 København";

interface UploadCardProps {
  onSubmit: (
    file: File,
    storesPerDay: number,
    prioritizeRevenue: boolean,
    journeyMode: JourneyMode,
    startAddress: string,
  ) => void;
  isLoading: boolean;
  progress: ProgressEvent | null;
}

export function UploadCard({ onSubmit, isLoading, progress }: UploadCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [storesPerDay, setStoresPerDay] = useState(20);
  const [prioritizeRevenue, setPrioritizeRevenue] = useState(false);
  const [journeyMode, setJourneyMode] = useState<JourneyMode>("continue");
  const [startAddress, setStartAddress] = useState(PRESET_ADDRESS);
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

  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  const stageLabel =
    progress?.stage === "solving"
      ? "Solving optimal route..."
      : progress?.stage === "routing"
        ? "Computing road distances..."
        : progress
          ? `Geocoding ${progress.current} of ${progress.total}...`
          : "";

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

        {/* Journey mode */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Daily journey mode</label>
          <Select
            value={journeyMode}
            onValueChange={(v) => setJourneyMode(v as JourneyMode)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select journey mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="continue">
                Continue from where you left off
              </SelectItem>
              <SelectItem value="same_start">
                Start from base each day
              </SelectItem>
              <SelectItem value="round_trip">
                Start &amp; return to base each day
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground min-h-[2rem]">
            {journeyMode === "continue" &&
              "Each day begins where the previous day ended."}
            {journeyMode === "same_start" &&
              "Each day you travel from your base to the first store, then continue until done."}
            {journeyMode === "round_trip" &&
              "Each day you leave your base, visit stores, and return to base."}
          </p>
        </div>

        {/* Start address (always rendered, disabled for "continue" mode) */}
        <div className={`space-y-2 transition-opacity ${journeyMode === "continue" ? "opacity-40 pointer-events-none" : "opacity-100"}`}>
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Home className="size-3.5" />
            Base location address
          </label>
          <Select
            value={startAddress === PRESET_ADDRESS ? "preset" : "custom"}
            onValueChange={(v) => {
              if (v === "preset") {
                setStartAddress(PRESET_ADDRESS);
              } else {
                setStartAddress("");
              }
            }}
            disabled={journeyMode === "continue"}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="preset">{PRESET_ADDRESS}</SelectItem>
              <SelectItem value="custom">Custom address...</SelectItem>
            </SelectContent>
          </Select>
          {startAddress !== PRESET_ADDRESS && journeyMode !== "continue" && (
            <Input
              id="start-address"
              placeholder="e.g. Nørrebrogade 1, 2200 København"
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              autoFocus
            />
          )}
          <p className="text-xs text-muted-foreground">
            The address you start (and optionally return to) each day
          </p>
        </div>

        {/* Revenue prioritization toggle */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <label htmlFor="prioritize-revenue" className="text-sm font-medium cursor-pointer">
              Prioritize high-revenue stores
            </label>
            <p className="text-xs text-muted-foreground">
              Visit stores with higher GMV earlier in the route
            </p>
          </div>
          <Switch
            id="prioritize-revenue"
            checked={prioritizeRevenue}
            onCheckedChange={setPrioritizeRevenue}
          />
        </div>

        {/* Submit */}
        <Button
          className="w-full"
          disabled={!file || isLoading || (journeyMode !== "continue" && !startAddress.trim())}
          onClick={() =>
            file && onSubmit(file, storesPerDay, prioritizeRevenue, journeyMode, startAddress)
          }
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

        {/* Progress bar */}
        {isLoading && (
          <div className="space-y-2">
            <Progress value={progressPercent} className="h-2" />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {stageLabel}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {progressPercent}%
              </p>
            </div>
            {progress?.stage === "geocoding" && progress.address && (
              <p className="text-xs text-muted-foreground truncate">
                {progress.address}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
