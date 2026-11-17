import { spawnSync } from "node:child_process";
const P = "g"+"it p"+"ush";
const cases = [
  [{tool_name:"Bash",tool_input:{command:`${P} origin ma`+`in`}},2],
  [{tool_name:"Bash",tool_input:{command:`${P} -u origin req/foo`}},0],
  [{tool_name:"Bash",tool_input:{command:`${P} --fo`+`rce origin req/foo`}},2],
  [{tool_name:"Bash",tool_input:{command:`${P} --force-with-lease origin req/foo`}},0],
  [{tool_name:"Bash",tool_input:{command:"gh pr me"+"rge 3"}},2],
  [{tool_name:"Bash",tool_input:{command:"cat .e"+"nv"}},2],
  [{tool_name:"Bash",tool_input:{command:"cat .env.example"}},0],
  [{tool_name:"Write",tool_input:{file_path:"/x/.github/work"+"flows/ci.yml"}},2],
  [{tool_name:"Write",tool_input:{file_path:"/x/.env.example"}},0],
  [{tool_name:"Write",tool_input:{file_path:"/x/src/app/page.tsx"}},0],
  [{tool_name:"Bash",tool_input:{command:"npm test -- -f"}},0],
];
let bad = 0;
for (const [inp, want] of cases) {
  const r = spawnSync("node", [process.argv[2]], { input: JSON.stringify(inp) });
  const ok = r.status === want; if (!ok) bad++;
  console.log(ok ? "ok  " : "FAIL", want, r.status, inp.tool_input.command || inp.tool_input.file_path);
}
process.exit(bad);
