import type { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Table(props: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("min-w-full divide-y divide-slate-200", props.className)} {...props} />;
}

export function TableHead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-slate-50", props.className)} {...props} />;
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-slate-100 bg-surface text-sm", props.className)} {...props} />;
}

export function TableRow(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("text-left", props.className)} {...props} />;
}

export function TableHeaderCell(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500", props.className)}
      {...props}
    />
  );
}

export function TableCell(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3", props.className)} {...props} />;
}
