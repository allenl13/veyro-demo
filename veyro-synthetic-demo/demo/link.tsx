import type { AnchorHTMLAttributes } from "react";
export default function Link({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props}>{children}</a>; }
