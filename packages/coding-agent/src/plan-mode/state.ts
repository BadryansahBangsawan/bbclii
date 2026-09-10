export interface PlanModeState {
	enabled: boolean;
	planFilePath: string;
	workflow?: "parallel" | "iterative";
	ultraplan?: boolean;
	reentry?: boolean;
}
