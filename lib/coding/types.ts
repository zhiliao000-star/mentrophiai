export type CodingMode = "chat" | "coding";

export type CodingRepo = {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  defaultBranch: string;
  private: boolean;
};

export type CodingEvent =
  | { type: "status"; message: string }
  | { type: "step"; step: string; status: "pending" | "active" | "done" }
  | { type: "log"; message: string }
  | { type: "files"; files: string[] }
  | { type: "diff"; diff: string }
  | {
      type: "result";
      branch: string | null;
      pullRequestUrl: string | null;
      summary: string;
    }
  | { type: "error"; message: string };
