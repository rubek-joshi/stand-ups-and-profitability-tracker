export const MAIL_QUEUE = "mail";
export const RECALCULATE_QUEUE = "recalculate";

export type RecalculateJobPayload = {
  reason: string;
  employeeId?: string;
  coreMemberId?: string;
  salaryEntryId?: string;
  projectId?: string;
};
