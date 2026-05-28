import type { MembershipRole } from "@prisma/client";

export type ActiveWorkspace = {
  user: {
    id: string;
    email: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  campaign: {
    id: string;
    name: string;
    electionYear: number;
    state: string;
  };
  role: MembershipRole | "OWNER";
};
