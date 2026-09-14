import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';
import { ActivityType } from '@projectflow/shared';

export type ActivityDocument = HydratedDocument<Activity>;

@Schema({ timestamps: true, collection: 'activities' })
export class Activity {
  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  taskId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(ActivityType), required: true })
  type: ActivityType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId: Types.ObjectId;

  @Prop({ type: Object, default: {} })
  metadata: {
    from?: string | null;
    to?: string | null;
  };

  createdAt: Date;
  updatedAt: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

ActivitySchema.index({ taskId: 1, createdAt: -1 });
