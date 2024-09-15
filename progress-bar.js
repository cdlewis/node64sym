// Adapted from https://stackoverflow.com/questions/71898650/how-to-work-with-logging-and-progress-bar-in-a-node-js-cli-application

class ProgressBar {
  constructor(total, str_left, str_right) {
    this.str_left = ".";
    this.str_right = " ";
    if (str_left) this.str_left = str_left;
    if (str_right) this.str_right = str_right;
    this.total = total;
    this.current = 0;
    this.strtotal = 60;
  }

  update(current) {
    this.current++;

    if (current) this.current = current;

    const dots = this.str_left.repeat(
      parseInt(((this.current % this.total) / this.total) * this.strtotal)
    );
    const left =
      this.strtotal -
      parseInt(((this.current % this.total) / this.total) * this.strtotal);
    const empty = this.str_right.repeat(left);

    process.stderr.write(
      `\r[${dots}${empty}] ${parseInt((this.current / this.total) * 100)}% [${
        this.total
      }-${this.current}]`
    );
  }
}

module.exports = { ProgressBar };
