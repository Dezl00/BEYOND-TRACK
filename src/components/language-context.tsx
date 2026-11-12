"use client";
import { createContext, useContext } from "react";
import { language } from "@/messages/catalog";
import type { Locale } from "@/messages/types";
export const LocaleContext = createContext<Locale>("ar");
const catalogs = { ar: language("ar"), en: language("en") };
export const useLanguage = () => catalogs[useContext(LocaleContext)];
