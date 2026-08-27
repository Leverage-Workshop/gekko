/**
 * The private Storage bucket the job-plan task uploads its rendered profile
 * PNGs to (feat-128), keyed `<sha256>.png`. A leaf module on purpose: the
 * dashboard (feat-129) reads the bucket name without importing the vision
 * read, whose rasterizer is a native module the Next.js server graph cannot
 * bundle.
 */
export const JOB_PLAN_IMAGES_BUCKET = 'job-plan-images'
