"use client";
import { useLanguage } from "@/components/language-context";

import { createContext, useContext } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";

import { Lookup } from "./dropdown";
export const ProjectContext = createContext<{
  name?: string;
  choices: { id: string; name: string }[];
}>({ choices: [] });
export default function ProjectSelector() {
  const { m: msg } = useLanguage();
  
  const { name, choices } = useContext(ProjectContext);
  const path = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const project = params.get("project") || "";
  return (
    <div className="project-selector">
      <Building2 size={17} aria-hidden="true" />
      <Lookup
        resource="projects"
        value={project || (choices.length === 1 ? choices[0].id : "")}
        initialLabel={
          name || (choices.length === 1 ? choices[0].name : undefined)
        }
        allowNone={choices.length !== 1}
        allLabel={msg.common.allProjects}
        onChange={(value) => {
          const next = new URLSearchParams(params.toString());
          for (const key of ["cursor", "mains", "seconds", "leaves"])
            next.delete(key);
          if (path.startsWith("/reports")) next.delete("items");
          if (value) next.set("project", value);
          else next.delete("project");
          router.push(path + "?" + next.toString(), { scroll: false });
        }}
      />
    </div>
  );
}
