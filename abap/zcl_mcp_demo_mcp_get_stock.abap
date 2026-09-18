*----------------------------------------------------------------------*
* 拷贝到 ZCL_MCP_DEMO 的 MCP_GET_STOCK
* 通用接口账号调用；uname 为业务账号，权限查 AGR_1251
* Body：
*   { "uname": "BAKKF", "matnr": "10000001", "werks": "1100" }
*----------------------------------------------------------------------*
  METHOD mcp_get_stock.

    TYPES: BEGIN OF ty_stock,
             matnr TYPE matnr,
             werks TYPE werks_d,
             lgort TYPE lgort_d,
             labst TYPE labst,
             insme TYPE insme,
             speme TYPE speme,
           END OF ty_stock.

    DATA: BEGIN OF ls_req,
            uname TYPE sy-uname,
            matnr TYPE matnr,
            werks TYPE werks_d,
          END OF ls_req.

    DATA: BEGIN OF ls_out,
            type    TYPE bapiret2-type,
            message TYPE bapiret2-message,
            items   TYPE TABLE OF ty_stock,
          END OF ls_out.

    DATA(lv_json_in) = io_request->get_cdata( ).

    /ui2/cl_json=>deserialize(
      EXPORTING
        json        = lv_json_in
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      CHANGING
        data        = ls_req
    ).

    IF check_mcp_tool( iv_uname = ls_req-uname iv_tool = 'GET_STOCK' ) = abap_false.
      ls_out-type    = 'E'.
      ls_out-message = |用户 { ls_req-uname } 无权限 GET_STOCK|.
      gs_msg-msg_type    = ls_out-type.
      gs_msg-msg_content = ls_out-message.
      ev_json = /ui2/cl_json=>serialize(
        data        = ls_out
        pretty_name = /ui2/cl_json=>pretty_mode-low_case
      ).
      RETURN.
    ENDIF.

    DATA(lv_matnr) = conv matnr( |{ ls_req-matnr ALPHA = IN }| ).
    DATA(lv_werks) = ls_req-werks.

    IF lv_matnr IS INITIAL.
      ls_out-type    = 'E'.
      ls_out-message = '物料号 matnr 不能为空'.
    ELSE.
      IF lv_werks IS INITIAL.
        SELECT matnr, werks, lgort, labst, insme, speme
          FROM mard
          WHERE matnr = @lv_matnr
          INTO TABLE @ls_out-items.
      ELSE.
        SELECT matnr, werks, lgort, labst, insme, speme
          FROM mard
          WHERE matnr = @lv_matnr
            AND werks = @lv_werks
          INTO TABLE @ls_out-items.
      ENDIF.

      IF ls_out-items IS INITIAL.
        ls_out-type    = 'E'.
        ls_out-message = |未找到物料 { ls_req-matnr } 的库存|.
      ELSE.
        ls_out-type    = 'S'.
        ls_out-message = |查询库存成功，共 { lines( ls_out-items ) } 条|.
      ENDIF.
    ENDIF.

    gs_msg-msg_type    = ls_out-type.
    gs_msg-msg_content = ls_out-message.
    gs_msg-ref_doc     = lv_matnr.

    ev_json = /ui2/cl_json=>serialize(
      data        = ls_out
      pretty_name = /ui2/cl_json=>pretty_mode-low_case
    ).

  ENDMETHOD.
