"use client";
import { createContext, useContext } from "react";
export const FormatContext = createContext(0);
export const useDigits = () => useContext(FormatContext);
