"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/connections", label: "Connections" },
  { href: "/posts", label: "Posts" },
  { href: "/jobs", label: "Jobs" },
  { href: "/published", label: "Published" },
  { href: "/metrics", label: "Metrics" },
  { href: "/usage", label: "Usage" },
  { href: "/billing", label: "Billing" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex flex-wrap gap-2">
      {links.map((link) => {
        const active = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              active
                ? "rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
                : "rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-black"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}