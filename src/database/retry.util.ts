export async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  retries = 5,
  delay = 1000,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) {
      throw error;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, delay),
    );

    return retryWithExponentialBackoff(
      fn,
      retries - 1,
      delay * 2,
    );
  }
}