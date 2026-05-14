import type { Feature } from '@/domain/feature/Feature';
import type { IWorkflowStateCodec } from './IWorkflowStateCodec';
import { serializeWorkflowState, deserializeWorkflowState } from './WorkflowStateDocument';

export class WorkflowStateCodec implements IWorkflowStateCodec {
	serialize(feature: Feature): string {
		return serializeWorkflowState(feature);
	}

	deserialize(content: string): Feature | null {
		return deserializeWorkflowState(content);
	}
}
