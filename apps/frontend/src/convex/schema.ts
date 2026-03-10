import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  todos: defineTable({
    title: v.string(),
    description: v.string(),
    completed: v.boolean(),
  }),
  optimisticDemoItems: defineTable({
    title: v.string(),
    lane: v.union(v.literal('alpha'), v.literal('beta')),
    rank: v.number(),
    completed: v.boolean(),
  })
    .index('by_lane', ['lane'])
    .index('by_lane_rank', ['lane', 'rank']),
});
