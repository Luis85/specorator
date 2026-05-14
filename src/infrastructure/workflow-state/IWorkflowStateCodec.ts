import type { Feature } from '@/domain/feature/Feature';

export interface IWorkflowStateCodec {
	serialize(feature: Feature): string;
	deserialize(content: string): Feature | null;
}
