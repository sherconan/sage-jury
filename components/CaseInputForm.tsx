"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Gavel, Loader2, Sparkles } from "lucide-react";
import type { CaseInput } from "@/types";
import { cn } from "@/lib/utils";
import { TickerLookup } from "./TickerLookup";

interface Props {
  onSubmit: (input: CaseInput) => void;
  loading?: boolean;
  initial?: Partial<CaseInput>;
}

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block">
    <div className="mb-1 flex items-baseline justify-between">
      <span className="font-serif text-sm font-medium text-ink-800">{label}</span>
      {hint && <span className="text-[10px] text-ink-500">{hint}</span>}
    </div>
    {children}
  </label>
);

const Slider = ({
  label, value, onChange, low, high, hint,
}: { label: string; value: number; onChange: (v: number) => void; low?: string; high?: string; hint?: string }) => (
  <div>
    <div className="mb-1 flex items-baseline justify-between">
      <span className="font-serif text-sm font-medium text-ink-800">{label}</span>
      <span className="font-mono text-xs font-medium text-ink-700">{value}/5</span>
    </div>
    <input
      type="range" min={1} max={5} step={1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-200 accent-gold-500"
    />
    {(low || high) && (
      <div className="mt-1 flex justify-between text-[10px] text-ink-500">
        <span>{low}</span><span>{high}</span>
      </div>
    )}
    {hint && <p className="mt-1 text-[11px] text-ink-500">{hint}</p>}
  </div>
);

export function CaseInputForm({ onSubmit, loading, initial }: Props) {
  const [form, setForm] = useState<CaseInput>({
    name: initial?.name || "",
    industry: initial?.industry || "",
    briefBusiness: initial?.briefBusiness || "",
    ticker: initial?.ticker,
    pe: initial?.pe,
    pb: initial?.pb,
    roe: initial?.roe,
    grossMargin: initial?.grossMargin,
    netMargin: initial?.netMargin,
    fcfMargin: initial?.fcfMargin,
    debtToAsset: initial?.debtToAsset,
    dividendYield: initial?.dividendYield,
    yearsListed: initial?.yearsListed,
    monopolyLevel: initial?.monopolyLevel ?? 3,
    brandStrength: initial?.brandStrength ?? 3,
    consumerStickiness: initial?.consumerStickiness ?? 3,
    repeatedConsumption: initial?.repeatedConsumption ?? 3,
    techDisruption: initial?.techDisruption ?? 2,
    regulatoryRisk: initial?.regulatoryRisk ?? 2,
    managementQuality: initial?.managementQuality ?? 3,
    inUserCircle: initial?.inUserCircle,
    cyclical: initial?.cyclical,
    oversoldRecently: initial?.oversoldRecently,
    consensusBullish: initial?.consensusBullish,
    catalystVisible: initial?.catalystVisible,
    intendedHoldYears: initial?.intendedHoldYears ?? 5,
    userBuyReason: initial?.userBuyReason || "",
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const set = <K extends keyof CaseInput>(k: K, v: CaseInput[K]) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="court-card relative overflow-visible bg-paper-grain">
      <header className="court-card-header">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-gold-400 bg-navy-700">
          <Gavel className="h-6 w-6 text-gold-300" />
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-xl font-bold text-ink-900">提交案卷</h2>
          <p className="text-xs text-ink-600">填写一笔交易决策的基本信息，提交陪审团评审</p>
        </div>
        <span className="nameplate hidden md:inline-flex">CASE FILE</span>
      </header>

      <div className="space-y-5 p-5">
        <TickerLookup onResult={(filled) => setForm(prev => ({ ...prev, ...filled }))} />

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="公司/标的名称" hint="必填">
            <input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="如：贵州茅台"
              className="case-input w-full"
            />
          </Field>
          <Field label="代码" hint="可选">
            <input
              value={form.ticker || ""}
              onChange={(e) => set("ticker", e.target.value || undefined)}
              placeholder="600519"
              className="case-input w-full"
            />
          </Field>
          <Field label="行业">
            <input
              value={form.industry}
              onChange={(e) => set("industry", e.target.value)}
              placeholder="白酒 / 互联网 / 新能源"
              className="case-input w-full"
            />
          </Field>
        </div>

        <Field label="一句话描述生意" hint="陪审团靠这句话理解你看的是什么">
          <textarea
            value={form.briefBusiness}
            onChange={(e) => set("briefBusiness", e.target.value)}
            placeholder="高端白酒龙头，品牌护城河深厚，定价权强"
            rows={2}
            className="case-textarea"
          />
        </Field>

        <Field label="你的买入理由（陪审员会引用）">
          <textarea
            value={form.userBuyReason}
            onChange={(e) => set("userBuyReason", e.target.value)}
            placeholder="为什么这个时候要买？拿多久？"
            rows={2}
            className="case-textarea"
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="PE 市盈率" hint="如 28">
            <input type="number" step="0.1" value={form.pe ?? ""} onChange={(e) => set("pe", e.target.value ? Number(e.target.value) : undefined)} className="case-input w-full" />
          </Field>
          <Field label="ROE" hint="百分比，如 28 = 28%">
            <input type="number" step="0.1" value={form.roe !== undefined ? form.roe * 100 : ""} onChange={(e) => set("roe", e.target.value ? Number(e.target.value) / 100 : undefined)} className="case-input w-full" placeholder="28" />
          </Field>
          <Field label="毛利率" hint="百分比">
            <input type="number" step="0.1" value={form.grossMargin !== undefined ? form.grossMargin * 100 : ""} onChange={(e) => set("grossMargin", e.target.value ? Number(e.target.value) / 100 : undefined)} className="case-input w-full" placeholder="60" />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Slider label="垄断属性" value={form.monopolyLevel ?? 3} onChange={(v) => set("monopolyLevel", v as 1|2|3|4|5)} low="红海" high="独家" />
          <Slider label="品牌强度" value={form.brandStrength ?? 3} onChange={(v) => set("brandStrength", v as 1|2|3|4|5)} low="无人知晓" high="国民级" />
          <Slider label="用户黏性" value={form.consumerStickiness ?? 3} onChange={(v) => set("consumerStickiness", v as 1|2|3|4|5)} low="可替代" high="离不开" />
          <Slider label="复购频率" value={form.repeatedConsumption ?? 3} onChange={(v) => set("repeatedConsumption", v as 1|2|3|4|5)} low="一辈子一次" high="天天用" />
          <Slider label="技术替代风险" value={form.techDisruption ?? 2} onChange={(v) => set("techDisruption", v as 1|2|3|4|5)} low="基本无" high="随时被颠覆" />
          <Slider label="管理层素质" value={form.managementQuality ?? 3} onChange={(v) => set("managementQuality", v as 1|2|3|4|5)} low="不靠谱" high="本分长期" />
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-ink-300 py-2 text-sm text-ink-600 transition-colors hover:bg-cream-100"
        >
          {advancedOpen ? "收起" : "展开"}进阶维度（PB / FCF / 持有时间 / 情绪 / 红旗）
          <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
        </button>

        {advancedOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-4 overflow-hidden border-t border-ink-200/60 pt-4"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="PB 市净率"><input type="number" step="0.1" value={form.pb ?? ""} onChange={(e) => set("pb", e.target.value ? Number(e.target.value) : undefined)} className="case-input w-full" /></Field>
              <Field label="净利率 %"><input type="number" step="0.1" value={form.netMargin !== undefined ? form.netMargin * 100 : ""} onChange={(e) => set("netMargin", e.target.value ? Number(e.target.value) / 100 : undefined)} className="case-input w-full" /></Field>
              <Field label="FCF 利润率 %"><input type="number" step="0.1" value={form.fcfMargin !== undefined ? form.fcfMargin * 100 : ""} onChange={(e) => set("fcfMargin", e.target.value ? Number(e.target.value) / 100 : undefined)} className="case-input w-full" /></Field>
              <Field label="资产负债率 %"><input type="number" step="0.1" value={form.debtToAsset !== undefined ? form.debtToAsset * 100 : ""} onChange={(e) => set("debtToAsset", e.target.value ? Number(e.target.value) / 100 : undefined)} className="case-input w-full" /></Field>
              <Field label="股息率 %"><input type="number" step="0.1" value={form.dividendYield !== undefined ? form.dividendYield * 100 : ""} onChange={(e) => set("dividendYield", e.target.value ? Number(e.target.value) / 100 : undefined)} className="case-input w-full" /></Field>
              <Field label="上市年数"><input type="number" value={form.yearsListed ?? ""} onChange={(e) => set("yearsListed", e.target.value ? Number(e.target.value) : undefined)} className="case-input w-full" /></Field>
            </div>

            <Slider label="监管/政策风险" value={form.regulatoryRisk ?? 2} onChange={(v) => set("regulatoryRisk", v as 1|2|3|4|5)} low="基本无" high="政策敏感" />

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="预计持有年数">
                <input type="number" value={form.intendedHoldYears ?? ""} onChange={(e) => set("intendedHoldYears", e.target.value ? Number(e.target.value) : undefined)} className="case-input w-full" placeholder="5" />
              </Field>
              <Field label="近期回撤 %">
                <input type="number" step="0.1" value={form.recentDrawdown !== undefined ? form.recentDrawdown * 100 : ""} onChange={(e) => set("recentDrawdown", e.target.value ? Number(e.target.value) / 100 : undefined)} className="case-input w-full" placeholder="40" />
              </Field>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                { key: "inUserCircle" as const, label: "你能清晰说出生意逻辑（在能力圈内）" },
                { key: "consensusBullish" as const, label: "市场目前对它一致看多" },
                { key: "oversoldRecently" as const, label: "近期被市场抛弃 / 严重超卖" },
                { key: "catalystVisible" as const, label: "12 个月内有明确反转催化剂" },
                { key: "cyclical" as const, label: "属于强周期行业" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2 rounded-lg border border-ink-200 bg-cream-50 px-3 py-2">
                  <input
                    type="checkbox"
                    id={key}
                    checked={form[key] === true}
                    onChange={(e) => set(key, e.target.checked || undefined as any)}
                    className="h-4 w-4 cursor-pointer accent-gold-500"
                  />
                  <label htmlFor={key} className="cursor-pointer text-sm text-ink-700">{label}</label>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <div className="gold-rule" />

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" disabled={loading || !form.name.trim()} className="btn-primary flex-1">
            {loading ? (
              <><Loader2 className="h-5 w-5 animate-spin" />陪审团审议中…</>
            ) : (
              <><Sparkles className="h-5 w-5" />提交陪审团评审</>
            )}
          </button>
          {form.name && (
            <button
              type="button"
              onClick={() => setForm({
                name: "", industry: "", briefBusiness: "",
                monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3,
                repeatedConsumption: 3, techDisruption: 2, regulatoryRisk: 2,
                managementQuality: 3, intendedHoldYears: 5, userBuyReason: "",
              })}
              className="btn-ghost text-sm"
            >
              清空表单
            </button>
          )}
        </div>
        <p className="text-center text-[11px] text-ink-500">
          评估完全在浏览器本地运行，不上传任何输入数据
        </p>
      </div>
    </form>
  );
}
