import { HealthResponseSchema } from '@scrum/shared';
import { createZodDto } from 'nestjs-zod';

export class HealthResponseDto extends createZodDto(HealthResponseSchema) {}
