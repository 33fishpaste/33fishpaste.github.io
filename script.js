/*--------------------------------------------------------------
  Warframe Item Tracker main script
  - Checklist / TODO / Build / Wish List
  - Damage‑type tag → Base64 icon conversion
  - Local‑Storage Export / Import / Clear
--------------------------------------------------------------*/

/***** DOM refs *****/
const g = {
  sidebar: document.getElementById("sidebar"),
  main:    document.getElementById("main"),
  dl:      null,   // datalist node (set later)
  data:    null,   // items.json
  flat:    []      // flattened items for suggestion / desc lookup
};

/* renderMenu の前にグローバル定義しておく */
const MENU_ORDER = ["all","kuva","tenet","coda","primary","secondary","melee","archgun","archmelee","sentinelweapon","mods","arcanes"];


/* ==== utility: simple debounce =================================== */
const debounce = (fn, delay = 200) => {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn.apply(this, args), delay);
  };
};

/* Backdrop (mobile) */
const backdrop = document.getElementById("backdrop");

/***** ダメージタイプ → Base64 アイコン (icon_src.jsで定義)*****

/* --- タグ → <img> に変換（未登録タグは非表示） --- */
const withIcons = (txt="") =>
  txt.replace(/<([^>]+)>/g, (_,tag)=>ICON_SRC[tag]?`<img class="dmg-icon" src="data:image/png;base64,${ICON_SRC[tag]}" alt="${tag}">`:"");

/***** ハンバーガー開閉 *****/
const hamburgerBtn = document.getElementById("hamburger");

function closeMenu () {
  g.sidebar.classList.add("hidden");
  document.body.classList.remove("menu-open");
  hamburgerBtn.classList.remove("active");     // ← アイコン状態リセット
}

/* モバイル: 背景タップで閉じる */
backdrop.addEventListener("click", closeMenu);

hamburgerBtn.addEventListener("click", () => {
  g.sidebar.classList.toggle("hidden");
  document.body.classList.toggle("menu-open");
  hamburgerBtn.classList.toggle("active");     // ← アニメーション切替
});

window.addEventListener("DOMContentLoaded",()=>innerWidth>=768?document.body.classList.add("menu-open"):closeMenu());

/***** Local‑storage helpers *****/
const lsKey = (id, scope="checked") => `wf:${scope}:${id}`;
const lsGet = (id, scope="checked", def=false) =>{
  const raw = localStorage.getItem(lsKey(id,scope));
  if(raw===null) return def;
  try{return JSON.parse(raw);}catch{return def;}
};
const lsSet = (id, scope, v)=>localStorage.setItem(lsKey(id,scope),JSON.stringify(v));

/*================== 1. CHECKLIST ==================*/
function renderTable(menu){
  const isPC = innerWidth >= 768;               // PC 判定

  /* ---- Controls ---- */
  g.main.innerHTML = `<h2>${menu.title}</h2>
  <div id="controls">
    <input id="search" type="text" placeholder="検索 …">
    <label><input id="showChecked" type="checkbox" checked> チェック済</label>
    <label><input id="showUnchecked" type="checkbox" checked> 未チェック</label>
    ${isPC ? "" : '<label><input id="showDetails" type="checkbox"> 詳細表示</label>'}
  </div>`;

  /* ---- Table skeleton ---- */
  const table = document.createElement("table"),
        thead = document.createElement("thead"),
        tbody = document.createElement("tbody");
  table.append(thead, tbody); g.main.appendChild(table);

  /* ---- Tooltip node (単一インスタンス) ---- */
  const tip = document.getElementById("tooltip") || Object.assign(document.createElement("div"), {id:"tooltip"});
  if(!tip.isConnected) document.body.appendChild(tip);
  const hideTip = () => tip.classList.remove("visible");
  const showTip = (html, target) => {
    tip.innerHTML = html;
    const r = target.getBoundingClientRect();
    const y = r.bottom + (window.scrollY || document.documentElement.scrollTop) + 8;
    tip.style.left = `${Math.max(8, r.left)}px`;
    tip.style.top  = `${y}px`;
    tip.classList.add("visible");
  };
  document.addEventListener("click", e=>{
    if(!e.target.closest(".tooltip-trigger")) hideTip();
  });

  /* ---- Rebuild ---- */
  const ANIM_LIMIT = 30;              // ← スライドさせる上限行数
  const rebuild = (animate = false)=>{
    const showDetails = isPC || g.main.querySelector("#showDetails")?.checked;
    const cols = isPC ? menu.columns
                      : menu.columns.filter(c=>c.mobileDefault);
    const showExtraRows = showDetails && !isPC; // スマホ詳細ON時のみ

    thead.innerHTML =
      `<tr><th></th>${cols.map(c=>`<th>${c.label}</th>`).join("")}</tr>`;

    const q     = g.main.querySelector("#search").value.trim().toLowerCase(),
          showC = g.main.querySelector("#showChecked").checked,
          showU = g.main.querySelector("#showUnchecked").checked;

    tbody.innerHTML = "";
    const frag = document.createDocumentFragment();  // 追加
    let seq = 0;
    menu.items.forEach(item=>{
      const checked = lsGet(item.id);
      if((checked&&!showC)||(!checked&&!showU)) return;
      if(q && !Object.values(item).join(" ").toLowerCase().includes(q)) return;

      /* ---- Main row ---- */
      const tr = document.createElement("tr");
      // ---- ★ レアリティによるクラス付与 ------------------
      const rarity = (item.rarity || "").toLowerCase();
      if (["common", "uncommon", "rare", "legendary"].includes(rarity)) {
       tr.classList.add(`rarity-${rarity}`);
      }
      const cb = Object.assign(document.createElement("input"),{
        type:"checkbox",checked,
        onchange:e=>{
          lsSet(item.id,"checked",e.target.checked);
          document.querySelectorAll(`input[data-id="${item.id}"]`)
                   .forEach(el=>el.checked=e.target.checked);
          rebuild();
        }
      });
      cb.dataset.id = item.id;
      tr.appendChild(document.createElement("td")).appendChild(cb);

      /* ---- Data cells ---- */
      cols.forEach(col=>{
        const td = document.createElement("td");

        if(col.key === "name"){
          const span = document.createElement("span");
          span.textContent = item[col.key];
          if(!showDetails){
            span.className = "tooltip-trigger";
            span.onclick = e=>{
              e.stopPropagation();
              if(tip.classList.contains("visible")){hideTip();return;}

              const hidden = menu.columns.filter(c=>!c.mobileDefault && c.key!=="desc");
              const rows = hidden.map(c=>{
                const val = item[c.key] ?? "";
                return `<tr><td class="h">${c.label}</td><td>${withIcons(val)}</td></tr>`;
              }).join("");
              const html = `<table>${rows}</table>${item.desc?`<div class="desc">${withIcons(item.desc)}</div>`:""}`;
              showTip(html, span);
            };
          }
          td.appendChild(span);

        }else if(col.type === "select"){
          const sid = `${item.id}:${col.key}`,
                val = lsGet(sid,"val",item[col.key]);
          const sel = document.createElement("select");
          col.options.forEach(o=>sel.add(new Option(`${o}%`,o,false,o==val)));
          sel.onchange=e=>lsSet(sid,"val",parseInt(e.target.value));
          sel.value = val; td.appendChild(sel);

        }else if(col.type === "input"){
          const sid = `${item.id}:${col.key}`,
                val = lsGet(sid,"val",item[col.key]||"");
          const inp = Object.assign(document.createElement("input"),{type:"text",value:val});
          inp.onblur=e=>lsSet(sid,"val",e.target.value);
          td.appendChild(inp);

        }else{
          td.innerHTML = withIcons(item[col.key] || "");
        }
        tr.appendChild(td);
      });
      frag.appendChild(tr);
      /* ---- slide‑in animation (先頭 ANIM_LIMIT 行のみ) ---- */
      if (animate && seq < ANIM_LIMIT) {
        tr.classList.add("slide-row");
        tr.style.animationDelay = `${seq * 10}ms`;
      }
      seq++;

      /* ---- extra rows for hidden columns (mobile only) ---- */
      if(showExtraRows){
        const hidden = menu.columns.filter(c=>!c.mobileDefault && c.key!=="desc");
        if(hidden.length){
          const rows = hidden.map(c=>{
            const val = item[c.key] ?? "";
            return `<tr><td class="h">${c.label}</td><td>${withIcons(val)}</td></tr>`;
          }).join("");
          const er = document.createElement("tr"); er.className = "extra-row";
          er.innerHTML = `<td></td><td colspan="${cols.length}"><table class="mini">${rows}</table></td>`;
          frag.appendChild(er);
          if (animate && seq < ANIM_LIMIT) {
            er.classList.add("slide-row");
            er.style.animationDelay = `${seq * 10}ms`;
          }
          seq++;
        }
      }

      /* ---- desc-row (desc) ---- */
      if(showDetails && item.desc){
        const dr = document.createElement("tr"); dr.className = "desc-row";
        dr.appendChild(document.createElement("td"));
        const dtd = document.createElement("td");
        dtd.colSpan = cols.length;
        dtd.innerHTML = withIcons(item.desc);
        dr.appendChild(dtd);
        frag.appendChild(dr);
        if (animate && seq < ANIM_LIMIT) {
          dr.classList.add("slide-row");
          dr.style.animationDelay = `${seq * 10}ms`;
        }
        seq++;
      }
    });

    /* ---- まとめて挿入（リフロー1回） ---- */
    tbody.appendChild(frag);
  };

  /* ---- Events (検索欄は debounce で負荷軽減) ---- */
  g.main.querySelector("#search")
        .addEventListener("input", debounce(() => rebuild(false), 250));
  ["showChecked","showUnchecked"]
    .forEach(id=>g.main.querySelector(`#${id}`).addEventListener("input",()=>rebuild(false)));

  if(!isPC){
    /* スマホ: 詳細表示トグルはアニメ有り */
    g.main.querySelector("#showDetails").addEventListener("input",()=>rebuild(true));
  }

  rebuild(true);
}

/*================== 2. TODO LIST ==================*/
const TODO_KEY="todo:list";
function renderTodo(){
  g.main.innerHTML="<h2>TODO</h2>";
  const table=document.createElement("table");
  table.innerHTML="<thead><tr><th></th><th>内容</th><th></th><th></th></tr></thead>";
  const tbody=document.createElement("tbody");table.appendChild(tbody);g.main.appendChild(table);

  const rebuild=()=>{
    tbody.innerHTML="";
    const todos=lsGet(TODO_KEY,"todo",[]);
    todos.forEach(t=>{
      const tr=document.createElement("tr");
      const cb=Object.assign(document.createElement("input"),{type:"checkbox",checked:t.checked,onchange:e=>{t.checked=e.target.checked;lsSet(TODO_KEY,"todo",todos);}});
      tr.appendChild(document.createElement("td")).appendChild(cb);
      const txtTd=tr.appendChild(document.createElement("td"));txtTd.textContent=t.text;

      const editBtn=document.createElement("button");editBtn.className="icon-btn";editBtn.innerHTML="✏";
      editBtn.onclick=()=>{
        const inp=document.createElement("input");inp.type="text";inp.value=t.text;inp.setAttribute("list","suggest");
        inp.onblur=()=>{t.text=inp.value.trim();lsSet(TODO_KEY,"todo",todos);rebuild();};
        txtTd.replaceChildren(inp);inp.focus();
      };
      tr.appendChild(document.createElement("td")).appendChild(editBtn);

      const delBtn=Object.assign(document.createElement("button"),{className:"icon-btn",innerHTML:"✖",onclick(){lsSet(TODO_KEY,"todo",todos.filter(x=>x.id!==t.id));rebuild();}});
      tr.appendChild(document.createElement("td")).appendChild(delBtn);
      tbody.appendChild(tr);
    });

    /* add row */
    const addTr=document.createElement("tr");addTr.innerHTML="<td></td>";
    const inpTd=addTr.appendChild(document.createElement("td"));
    const addInp=Object.assign(document.createElement("input"),{type:"text",placeholder:"新しいTODO…"});inpTd.appendChild(addInp);
    const plus=Object.assign(document.createElement("button"),{className:"icon-btn",innerHTML:"＋",onclick(){
      const txt=addInp.value.trim();if(!txt)return;
      todos.push({id:Date.now().toString(36),text:txt,checked:false});lsSet(TODO_KEY,"todo",todos);rebuild();
    }});
    addTr.appendChild(document.createElement("td")).appendChild(plus);
    addTr.appendChild(document.createElement("td"));tbody.appendChild(addTr);
  };
  rebuild();
}

/*================== 3. WISH LIST ==================*/
const WISH_KEY="wishlist:list";
function renderWishlist(){
  g.main.innerHTML="<h2>Wish List</h2>";
  const table=document.createElement("table");
  table.innerHTML="<thead><tr><th></th><th>アイテム</th><th>数</th><th>備考</th><th></th><th></th></tr></thead>";
  const tbody=document.createElement("tbody");table.appendChild(tbody);g.main.appendChild(table);

  const rebuild=()=>{
    tbody.innerHTML="";
    const list=lsGet(WISH_KEY,"wish",[]);
    list.forEach(w=>{
      const tr=document.createElement("tr");
      const cb=Object.assign(document.createElement("input"),{type:"checkbox",checked:w.checked,onchange:e=>{w.checked=e.target.checked;lsSet(WISH_KEY,"wish",list);}});
      tr.appendChild(document.createElement("td")).appendChild(cb);

      const itemTd=tr.appendChild(document.createElement("td"));itemTd.textContent=w.item||"";
      const numTd =tr.appendChild(document.createElement("td"));numTd.textContent=w.qty||"";
      const noteTd=tr.appendChild(document.createElement("td"));noteTd.textContent=w.note||"";

      /* edit */
      const editBtn=document.createElement("button");editBtn.className="icon-btn";editBtn.innerHTML="✏";
      editBtn.onclick=()=>{
        const itmInp=document.createElement("input");itmInp.type="text";itmInp.value=w.item;itmInp.setAttribute("list","suggest");
        const qtyInp=document.createElement("input");qtyInp.type="text";qtyInp.value=w.qty;
        const noteInp=document.createElement("input");noteInp.type="text";noteInp.value=w.note;
        const save=()=>{w.item=itmInp.value.trim();w.qty=qtyInp.value.trim();w.note=noteInp.value.trim();lsSet(WISH_KEY,"wish",list);rebuild();};
        [itmInp,qtyInp,noteInp].forEach(inp=>inp.onblur=save);
        itemTd.replaceChildren(itmInp);qtyInp.style.width="4em";numTd.replaceChildren(qtyInp);noteTd.replaceChildren(noteInp);
        itmInp.focus();
      };
      tr.appendChild(document.createElement("td")).appendChild(editBtn);

      const delBtn=Object.assign(document.createElement("button"),{className:"icon-btn",innerHTML:"✖",onclick(){lsSet(WISH_KEY,"wish",list.filter(x=>x.id!==w.id));rebuild();}});
      tr.appendChild(document.createElement("td")).appendChild(delBtn);
      tbody.appendChild(tr);
    });

    /* add row */
    const addTr=document.createElement("tr");addTr.innerHTML="<td></td>";
    const itmTd=addTr.appendChild(document.createElement("td"));
    const itmInp=Object.assign(document.createElement("input"),{type:"text",placeholder:"アイテム名"});itmInp.setAttribute("list","suggest");itmTd.appendChild(itmInp);
    const qtyTd=addTr.appendChild(document.createElement("td"));
    const qtyInp=Object.assign(document.createElement("input"),{type:"text",placeholder:"1",style:"width:4em"});qtyTd.appendChild(qtyInp);
    const noteTd=addTr.appendChild(document.createElement("td"));
    const noteInp=Object.assign(document.createElement("input"),{type:"text",placeholder:"備考"});noteTd.appendChild(noteInp);

    const addBtn=Object.assign(document.createElement("button"),{className:"icon-btn",innerHTML:"＋",onclick(){
      const item=itmInp.value.trim();if(!item)return;
      list.push({id:Date.now().toString(36),item,qty:qtyInp.value.trim(),note:noteInp.value.trim(),checked:false});
      lsSet(WISH_KEY,"wish",list);rebuild();
    }});
    addTr.appendChild(document.createElement("td")).appendChild(addBtn);
    addTr.appendChild(document.createElement("td"));tbody.appendChild(addTr);
  };
  rebuild();
}

/*================== 4. BUILD MANAGER ==================*/
const BUILD_KEY="builds:list";
function renderBuilds(){
  const builds=lsGet(BUILD_KEY,"build",[]);
  g.main.innerHTML="<h2>Builds</h2>";
  const grid=document.createElement("div");grid.className="build-grid";g.main.appendChild(grid);

  const slotCfg=t=>{
    switch(t){
      case"Warframe":return{arc:2,aura:true,stance:false,exi:true};
      case"近接":return{arc:0,aura:false,stance:true,exi:true};
      default:return{arc:2,aura:false,stance:false,exi:true};
    }
  };

  const addCard=obj=>{
    const cfg=slotCfg(obj.type);
    const card=document.createElement("div");card.className="build-card";grid.appendChild(card);

    /* view */
    const view=document.createElement("div");view.className="view";card.appendChild(view);
    view.appendChild(Object.assign(document.createElement("div"),{className:"build-header",textContent:`${obj.type} – ${obj.item||"(no item)"} / ${obj.name||"Unnamed"}`}));

    const line=(label,val)=>{
      if(!val)return;
      const li=document.createElement("div");li.className="build-line";
      const id=val.replace(/\s+/g,"_");
      const have=lsGet(id);
      const cb=Object.assign(document.createElement("input"),{type:"checkbox",checked:have,onchange:e=>{
        lsSet(id,"checked",e.target.checked);
        document.querySelectorAll(`input[data-id="${id}"]`).forEach(el=>el.checked=e.target.checked);
      }});
      cb.dataset.id=id;li.appendChild(cb);
      li.appendChild(Object.assign(document.createElement("span"),{innerHTML:`${label}: ${withIcons(val)}`}));
      const itm=g.flat.find(x=>x.label===val||x.name===val);
      if(itm&&itm.desc){const d=document.createElement("div");d.className="desc";d.innerHTML=withIcons(itm.desc);li.appendChild(d);}
      view.appendChild(li);
    };
    obj.arcanes.forEach((a,i)=>line(`Arcane${i+1}`,a));
    if(cfg.aura)line("Aura",obj.aura);
    if(cfg.stance)line("Stance",obj.aura);
    if(cfg.exi)line("Exilus",obj.exilus);
    obj.mods.forEach((m,i)=>line(`Mod${i+1}`,m));
    if(obj.note){const p=document.createElement("p");p.className="note";p.innerHTML=withIcons(obj.note);view.appendChild(p);}

    /* buttons & edit */
    const btnRow=document.createElement("div");btnRow.className="btn-row";card.appendChild(btnRow);
    const editBtn=document.createElement("button");editBtn.textContent="✏";
    const delBtn=document.createElement("button");delBtn.textContent="✖";btnRow.append(editBtn,delBtn);

    const edit=document.createElement("div");edit.className="edit hidden";card.appendChild(edit);
    const typeSel=document.createElement("select");["Warframe","プライマリ","セカンダリ","近接"].forEach(t=>typeSel.add(new Option(t,t,false,t===obj.type)));
    const itemInp=document.createElement("input");itemInp.type="text";itemInp.value=obj.item;itemInp.setAttribute("list","suggest");
    const nameInp=Object.assign(document.createElement("input"),{type:"text",value:obj.name});
    edit.appendChild(Object.assign(document.createElement("h4"),{textContent:"タイトル"}));
    edit.append("分類:",typeSel," アイテム名:",itemInp," ビルド名:",nameInp);

    const inpRow=(lbl,val)=>{
      const d=document.createElement("div");d.className="form-row";
      d.appendChild(Object.assign(document.createElement("label"),{textContent:lbl}));
      const i=document.createElement("input");i.type="text";i.value=val;i.setAttribute("list","suggest");d.appendChild(i);edit.appendChild(d);return i;
    };
    edit.appendChild(Object.assign(document.createElement("h4"),{textContent:"Slots"}));
    const arc=[];for(let i=0;i<cfg.arc;i++)arc.push(inpRow(`Arcane${i+1}`,obj.arcanes[i]||""));
    let auraInp=null;if(cfg.aura||cfg.stance)auraInp=inpRow(cfg.stance?"Stance":"Aura",obj.aura);
    let exiInp=null;if(cfg.exi)exiInp=inpRow("Exilus",obj.exilus);
    const mods=[];for(let i=0;i<8;i++)mods.push(inpRow(`Mod${i+1}`,obj.mods[i]||""));

    edit.appendChild(Object.assign(document.createElement("h4"),{textContent:"Note"}));
    const noteArea=Object.assign(document.createElement("textarea"),{value:obj.note,rows:3});edit.appendChild(noteArea);
    const save=document.createElement("button");save.textContent="保存";
    const cancel=document.createElement("button");cancel.textContent="キャンセル";edit.append(save,cancel);

    editBtn.onclick=()=>{view.classList.add("hidden");edit.classList.remove("hidden");};
    cancel.onclick=()=>{edit.classList.add("hidden");view.classList.remove("hidden");};
    delBtn.onclick=()=>{if(confirm("Delete build?")){lsSet(BUILD_KEY,"build",builds.filter(b=>b.id!==obj.id));card.remove();}};
    save.onclick=()=>{
      obj.type=typeSel.value;obj.item=itemInp.value.trim();obj.name=nameInp.value.trim();
      obj.arcanes=arc.map(i=>i.value.trim());obj.aura=auraInp?auraInp.value.trim():"";obj.exilus=exiInp?exiInp.value.trim():"";obj.mods=mods.map(i=>i.value.trim());obj.note=noteArea.value;
      const arr=lsGet(BUILD_KEY,"build",[]);const idx=arr.findIndex(b=>b.id===obj.id);idx===-1?arr.push(obj):arr[idx]=obj;lsSet(BUILD_KEY,"build",arr);
      card.remove();addCard(obj);
    };
  };
  builds.forEach(b=>addCard({...{id:Date.now().toString(36),type:"Warframe",item:"",name:"",arcanes:["",""],aura:"",exilus:"",mods:Array(8).fill(""),note:""},...b}));
  const newBtn=document.createElement("button");newBtn.id="add-build";newBtn.textContent="＋ New Build";
  newBtn.onclick=()=>addCard({id:Date.now().toString(36),type:"Warframe",item:"",name:"",arcanes:["",""],aura:"",exilus:"",mods:Array(8).fill(""),note:""});
  g.main.appendChild(newBtn);
}

/*================== 5. STORAGE I/O ==================*/
function renderStorageIO(){
  g.main.innerHTML=`
  <h2>ストレージ入出力</h2>
  <section><h3>エクスポート</h3><button id="btn-export">全データを書き出し (JSON)</button></section>
  <section><h3>インポート</h3>
    <textarea id="import-area" rows="6" style="width:100%;" placeholder="ここに JSON を貼り付け"></textarea><br>
    <button id="btn-import">読み込み</button>
  </section>
  <section><h3>削除</h3><button id="btn-clear" style="background:#d33;color:#fff;">Warframe Tracker データを全削除</button></section>`;

  g.main.querySelector("#btn-export").onclick=()=>{
    const data={};Object.keys(localStorage).filter(k=>k.startsWith("wf:")).forEach(k=>data[k]=localStorage.getItem(k));
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="wf_data.json";a.click();
  };
  g.main.querySelector("#btn-import").onclick=()=>{
    try{
      const obj=JSON.parse(g.main.querySelector("#import-area").value.trim());
      Object.entries(obj).forEach(([k,v])=>k.startsWith("wf:")&&localStorage.setItem(k,v));
      alert("読み込みました。再読込してください");
    }catch{alert("JSON 解析失敗");}
  };
  g.main.querySelector("#btn-clear").onclick=()=>{if(confirm("本当に削除しますか？")){
    Object.keys(localStorage).filter(k=>k.startsWith("wf:")).forEach(k=>localStorage.removeItem(k));
    alert("削除しました。再読込してください");
  }};
}

/*================== 6. MENU + bootstrap ==================*/
function renderMenu(data){
  /* --- MENU_ORDER に従い並べ替え ------------------------- */
  data.menus.sort((a, b) => {
    const ai = MENU_ORDER.indexOf(a.id);
    const bi = MENU_ORDER.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  /* === 0) 全横断検索メニューを生成 ======================== */
  /* 除外したいメニュー id をここで列挙 */
  const EXCLUDE_IDS = ["kuva","tenet","coda"];

  const globalMenu = {
    id:   "search_all",
    title:"Warframe Item Tracker",
    columns:[
      {key:"name",     label:"名前",   type:"text", mobileDefault:true},
      {key:"category", label:"カテゴリ", type:"text", mobileDefault:true}
    ],
    items:[]
  };
  /* 既存メニューを走査して items をコピーし category を付与（除外 ID を無視） */
  data.menus
      .filter(m => !EXCLUDE_IDS.includes(m.id))
      .forEach(m=>{
        m.items?.forEach(it=>{
          globalMenu.items.push({...it, category:m.title});
        });
      });

  /* 名前順にソート（item.name が無い場合は label / id を fallback） */
  globalMenu.items.sort((a,b)=>
    (a.name || a.label || a.id).localeCompare(b.name || b.label || b.id, "ja")
  );

  g.data = data;
  g.flat = [];
  data.menus.forEach(m => m.items?.forEach(it => g.flat.push(it)));
  if(!g.dl){g.dl=document.createElement("datalist");g.dl.id="suggest";document.body.appendChild(g.dl);}g.dl.innerHTML="";
  g.flat.forEach(it=>{const o=document.createElement("option");o.value=it.label||it.name||it.id;g.dl.appendChild(o);});

  g.sidebar.innerHTML="";
  /* globalMenu を先頭に挿入 ------------------------------- */
  const menuDefs=[globalMenu, ...data.menus,
    {id:"builds",title:"Builds",type:"builds"},
    {id:"todo",title:"TODO",type:"todo"},
    {id:"wish",title:"Wish List",type:"wish"},          // ★ 追加
    {id:"storage",title:"ストレージ",type:"storage"}
  ];
  menuDefs.forEach((m,i)=>{
    const div=document.createElement("div");div.textContent=m.title;div.className="menu-item"+(i===0?" active":"");
    div.onclick=()=>{
      g.sidebar.querySelectorAll(".menu-item").forEach(x=>x.classList.remove("active"));div.classList.add("active");
      if(m.type==="todo")renderTodo();
      else if(m.type==="builds")renderBuilds();
      else if(m.type==="wish")renderWishlist();
      else if(m.type==="storage")renderStorageIO();
      else renderTable(m);
      /* スマホのみ自動で閉じる。PC は開いたまま */
      if (innerWidth < 768) closeMenu();
    };
    g.sidebar.appendChild(div);
  });
  /* 最初に全横断検索を表示（= menuDefs[0]） */
  renderTable(menuDefs[0]);
}

/***** 起動 *****/
fetch("items.json").then(r=>r.json()).then(data => {
    /* --- 0) mobileDefault を文字列 → Boolean に変換 --- */
    data.menus?.forEach(menu => {
      menu.columns?.forEach(col => {
        if (typeof col.mobileDefault === "string") {
          col.mobileDefault = (col.mobileDefault.toLowerCase() === "true");
        }
      });
    });

    /* --- 1) 既存アイテムを辞書化しておく ---------------- */
    const dict = {};
    data.menus.forEach(m =>
        m.items?.forEach(it => { if (it && typeof it === "object") dict[it.id] = it; })
    );
    /* --- 2) items 配列に文字列(id)があれば差し替える ---- */
    data.menus.forEach(m => {
      if (Array.isArray(m.items)) {
          m.items = m.items.map(it => typeof it === "string" ? { ...dict[it] } : it);
      }
    });

    renderMenu(data);           // ← ここで初めて描画へ
  })
  .catch(()=>g.main.textContent="items.json の読み込みに失敗しました。");
