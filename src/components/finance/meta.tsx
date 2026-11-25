"use client";
import {
  ArrowLeftRight, Banknote, Briefcase, Bus, CircleEllipsis, Clapperboard, CreditCard, Fuel, Gift, GraduationCap, HeartPulse, Home, Landmark,
  PiggyBank, Plane, Receipt, Repeat, ShoppingBag, ShoppingBasket, Sparkles, Store, Tag, TrendingUp, Undo2, Utensils, Wallet, type LucideIcon,
} from "lucide-react";
import { DEFAULT_CATEGORIES, TRANSFER_CATEGORY } from "@/lib/finance";

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, "shopping-basket": ShoppingBasket, bus: Bus, fuel: Fuel, "shopping-bag": ShoppingBag, receipt: Receipt, home: Home,
  "heart-pulse": HeartPulse, "graduation-cap": GraduationCap, clapperboard: Clapperboard, plane: Plane, gift: Gift, sparkles: Sparkles,
  repeat: Repeat, briefcase: Briefcase, store: Store, "trending-up": TrendingUp, "undo-2": Undo2, "circle-ellipsis": CircleEllipsis,
};
const BY_NAME = new Map(DEFAULT_CATEGORIES.map((c) => [c.name, ICONS[c.icon] ?? Tag]));

export function categoryIcon(name: string): LucideIcon {
  if (name === TRANSFER_CATEGORY) return ArrowLeftRight;
  return BY_NAME.get(name) ?? Tag;
}

export const ACCOUNT_ICONS: Record<string, LucideIcon> = { cash: Banknote, bank: Landmark, card: CreditCard, wallet: Wallet, savings: PiggyBank };
export const accountIcon = (type: string) => ACCOUNT_ICONS[type] ?? Landmark;

/** Account colour swatches (fills only — never used for text). */
export const ACCOUNT_COLORS = ["#13601F", "#993399", "#821F1F", "#A8740B", "#6B6B00", "#2F5D8A", "#5F5952", "#0F766E"];

/**
 * Chart fills derived from the theme tokens. Colours mark shapes only; every value is also printed
 * as text in the legend so nothing depends on colour alone.
 */
export function categoricalFills(c: { primary: string; success: string; warning: string; danger: string; text2: string }, secondary: string) {
  return [c.primary, c.success, c.warning, c.danger, secondary, c.text2];
}
