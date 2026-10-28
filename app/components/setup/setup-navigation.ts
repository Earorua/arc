"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { updatePageQuery, usePageQuery } from "../../lib/use-page-query";

export const setupStepNames = ["选择目标", "当前基础", "每周时间", "确认路线"] as const;
const setupStepKeys = ["goal", "foundation", "time", "confirm"] as const;

/** The address selects a previously reached step; answers and access stay in the owner-bound draft. */
export function useSetupNavigation({ enabled, ready, active = true, currentStep, maximumStep, minimumStep = 0, onNavigate }: {
  enabled: boolean; ready: boolean; active?: boolean; currentStep: number; maximumStep: number; minimumStep?: number; onNavigate: (step: number) => void;
}) {
  const requested = usePageQuery().get("step");
  const latest = useRef({ currentStep, onNavigate });
  useLayoutEffect(() => { latest.current = { currentStep, onNavigate }; });
  useEffect(() => {
    if (!enabled || !ready || !active) return;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      const requestedIndex = requested === null ? latest.current.currentStep : setupStepKeys.indexOf(requested as typeof setupStepKeys[number]);
      const safeStep = Math.min(Math.max(minimumStep, requestedIndex), maximumStep);
      if (safeStep !== latest.current.currentStep) latest.current.onNavigate(safeStep);
      if (requested !== setupStepKeys[safeStep]) updatePageQuery({ step: setupStepKeys[safeStep] }, true);
    });
    return () => { current = false; };
  }, [active, enabled, maximumStep, minimumStep, ready, requested]);
  return (step: number, replace = false) => {
    onNavigate(step);
    if (enabled) updatePageQuery({ step: setupStepKeys[step] }, replace);
  };
}
